// Agent UI · standalone synthetic GPUI demo. NEVER starts or controls Pi.
import { View, div } from "gpui-kit";
import { h_flex, v_flex, TextView, TextareaState, Textarea } from "gpui-base";
import { theme } from "herdr";
import { DEMO_TURNS } from "./fixtures.js";
import {
  summarizeActivity, toRailNodes, shortPrompt, turnGeometry, clampScroll,
  visibleTurnIds, railMarkers, previewTop,
} from "./model.js";

const STATUSES = {
  working: ["Working", "working"],
  done: ["Completed", "muted"],
  "needs-input": ["Needs attention", "blocked"],
};

function control(t, id, title, onClick, enabled = true) {
  return h_flex().id(id).h(29).px(11).flex_none().items_center()
    .rounded(7).border_1().border_color(t.border)
    .bg(t.raised).text_size(11.5)
    .text_color(enabled ? t.foreground : t.dim)
    .when(enabled, (el) => el.cursor_pointer().on_click((_event, cx) => onClick(cx)))
    .child(title);
}

function markdown(t, id, source) {
  // Official Herdr Mod guide: TextView.markdown(id, text). Not a home-grown parser.
  return v_flex().id(id).w_full().min_w(0).text_size(13.5).text_color(t.foreground)
    .child(TextView.markdown(`${id}-md`, String(source ?? "")));
}

function toolLabel(tool) {
  const names = { read: "Read", search: "Search", exec: "Run", edit: "Edit", custom: "Tool" };
  return names[tool.kind] ?? "Tool";
}

export default class AgentUi extends View {
  init() {
    this.turns = DEMO_TURNS.map((turn) => ({ ...turn, messages: [...turn.messages], tools: [...turn.tools] }));
    this.hoveredTurn = null;
    this.groupOpen = new Set();
    this.toolOpen = new Set();
    this.turnHeights = new Map();
    this.viewportHeight = 460;
    this.scrollY = 0;
    this.pendingJump = null;
    this.width = 800;
    this.localCount = 0;
    this.notice = "";
    this.composer = TextareaState.new({
      value: "",
      rows: 3,
      placeholder: "Message (demo only — nothing is sent)",
    });
    this.composer.on("change", (_event, cx) => cx.notify());
  }

  changeSize(size, cx) {
    const width = Math.round(size?.width ?? 800);
    if (Math.abs(width - this.width) >= 16) {
      this.width = width;
      if (width < 520) this.hoveredTurn = null;
      cx.notify();
    }
  }

  measureViewport(size, cx) {
    const height = Math.max(1, Math.round(size?.height ?? this.viewportHeight));
    if (Math.abs(height - this.viewportHeight) < 1) return;
    this.viewportHeight = height;
    const geometry = turnGeometry(this.turns, this.turnHeights);
    this.scrollY = clampScroll(this.scrollY, geometry.total, height);
    cx.notify();
  }

  measureTurn(id, size, cx) {
    const height = Number(size?.height);
    if (!Number.isFinite(height) || height <= 0) return;
    const oldHeight = this.turnHeights.get(id);
    if (oldHeight !== undefined && Math.abs(oldHeight - height) < 0.75) return;
    const before = turnGeometry(this.turns, this.turnHeights);
    const previous = before.ranges.find((r) => r.id === id);
    this.turnHeights.set(id, height);
    // Preserve the current reading anchor if a collapsed/expanded group
    // above the viewport changes size. Exact jump targets override this.
    if (!this.pendingJump && oldHeight !== undefined && previous?.end <= this.scrollY) {
      this.scrollY += height - oldHeight;
    }
    const after = turnGeometry(this.turns, this.turnHeights);
    if (this.pendingJump) {
      const target = after.ranges.find((r) => r.id === this.pendingJump);
      if (target) this.scrollY = target.start;
      if (after.complete) this.pendingJump = null;
    }
    this.scrollY = clampScroll(this.scrollY, after.total, this.viewportHeight);
    cx.notify();
  }

  scrollWheel(event, cx) {
    // Herdr's native palette documents the bridge's pixel e.delta.y.
    const delta = Number(event?.delta?.y);
    if (!Number.isFinite(delta) || !delta) return;
    const geometry = turnGeometry(this.turns, this.turnHeights);
    const next = clampScroll(this.scrollY - delta, geometry.total, this.viewportHeight);
    this.pendingJump = null;
    if (next === this.scrollY) return;
    this.scrollY = next;
    cx.stop_propagation();
    cx.notify();
  }

  selectTurn(id, cx) {
    if (!this.turns.some((turn) => turn.id === id)) return;
    const geometry = turnGeometry(this.turns, this.turnHeights);
    const target = geometry.ranges.find((r) => r.id === id);
    if (!target) return;
    // Scroll the SAME continuous transcript; do not slice away earlier turns.
    this.scrollY = clampScroll(target.start, geometry.total, this.viewportHeight);
    this.pendingJump = geometry.complete ? null : id;
    this.hoveredTurn = null;
    cx.notify();
  }

  showHover(id, hovered, cx) {
    if (this.width < 520) return;
    const next = hovered ? id : (this.hoveredTurn === id ? null : this.hoveredTurn);
    if (next !== this.hoveredTurn) {
      this.hoveredTurn = next;
      cx.notify();
    }
  }

  toggleGroup(id, cx) {
    if (this.groupOpen.has(id)) this.groupOpen.delete(id);
    else this.groupOpen.add(id);
    cx.notify();
  }

  toggleTool(id, cx) {
    if (this.toolOpen.has(id)) this.toolOpen.delete(id);
    else this.toolOpen.add(id);
    cx.notify();
  }

  send(cx) {
    const draft = String(this.composer.value() ?? "").trim();
    if (!draft) return;
    const id = `t-local-${++this.localCount}`;
    this.turns.push({
      id,
      prompt: draft,
      status: "done",
      tools: [],
      messages: [{ id: `a-local-${this.localCount}`, role: "assistant",
        text: "**Local preview only.** This message was not sent to Pi. Your running Agent was not touched." }],
    });
    this.composer.set_value("");
    this.notice = "Local preview · no Pi command was sent";
    this.selectTurn(id, cx);
  }

  statusLine(t, status) {
    const [label, token] = STATUSES[status] ?? ["Unknown", "dim"];
    const color = t[token] ?? t.muted;
    return h_flex().gap(6).items_center().text_color(color).text_size(11)
      .child(div().size(6).rounded(3).bg(color))
      .child(label);
  }

  toolDetail(t, tool) {
    const detail = String(tool.detail ?? "No details available.").slice(0, 8192);
    const headings = {
      read: "File excerpt",
      search: "Matches and source",
      exec: "Command output",
      edit: "Patch preview",
      custom: "Integration information",
    };
    const title = headings[tool.kind] ?? "Tool result";
    const warn = tool.status === "failed" || tool.status === "pending";
    return v_flex().id(`agent-ui-detail-${tool.id}`).pl(22).pr(8).py(7).gap(4)
      .border_l(1).border_color(t.border)
      .child(h_flex().gap(8).items_center()
        .child(div().flex_1().text_size(10.5).font_semibold()
          .text_color(t.foreground).child(title))
        .when(warn, (el) => el.child(div().text_size(10.5).text_color(t.blocked)
          .child(tool.status === "failed" ? "Failed" : "Needs input"))))
      .child(div().text_size(10.5).text_color(t.dim)
        .child(tool.target || "Unknown target"))
      .children(detail.split("\n").slice(0, 32).map((line, i) =>
        div().id(`agent-ui-detail-line-${tool.id}-${i}`).text_size(11.5)
          .text_color(tool.kind === "edit" && line.startsWith("+") ? (t.done || t.accent)
            : tool.kind === "edit" && line.startsWith("-") ? t.blocked : t.muted)
          .child(line || " ")))
      .when(detail.split("\n").length > 32, (el) => el.child(
        div().text_size(11).text_color(t.dim).child("Preview truncated · synthetic fixture")));
  }

  toolRow(t, tool) {
    const expanded = this.toolOpen.has(tool.id);
    const color = tool.status === "failed" ? t.blocked
      : tool.status === "pending" || tool.status === "running" ? t.working : t.muted;
    const status = tool.status === "failed" ? "Failed"
      : tool.status === "pending" ? "Pending"
      : tool.status === "running" ? "Working" : "Done";
    return v_flex().id(`agent-ui-tool-${tool.id}`).w_full().gap(5)
      .child(h_flex().id(`agent-ui-tool-trigger-${tool.id}`).h(29).w_full().gap(9)
        .items_center().cursor_pointer()
        .on_click((_event, cx) => this.toggleTool(tool.id, cx))
        .child(div().w(10).text_color(color).text_size(11)
          .child(tool.status === "failed" ? "!" : tool.status === "done" ? "✓" : "·"))
        .child(div().w(41).flex_none().text_size(11).text_color(t.dim).child(toolLabel(tool)))
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.foreground)
          .child(tool.target || tool.title))
        .child(div().text_size(10.5).text_color(color).child(status))
        .child(div().w(10).text_color(t.dim).child(expanded ? "⌄" : "›")))
      .when(expanded, (el) => el.child(this.toolDetail(t, tool)));
  }

  activity(t, turn) {
    const data = summarizeActivity(turn.tools);
    const open = this.groupOpen.has(turn.id);
    // Failures remain available after expanding the list; they are not the
    // same thing as requests for user input and do not drive rail color.
    const summary = data.failed ? `${data.label} · ${data.failed} failed` : data.label;
    return v_flex().id(`agent-ui-activity-${turn.id}`).w_full().gap(7)
      .child(h_flex().id(`agent-ui-group-trigger-${turn.id}`).h(29)
        .w_full().gap(9).items_center().cursor_pointer()
        .on_click((_event, cx) => this.toggleGroup(turn.id, cx))
        .child(div().w(12).text_color(t.dim).child(open ? "⌄" : "›"))
        .child(div().flex_1().min_w(0).truncate().text_size(11.5)
          .text_color(t.muted).child(summary)))
      .when(open, (el) => el.child(v_flex().id(`agent-ui-group-list-${turn.id}`)
        .w_full().pl(16).gap(3)
        .children(turn.tools.slice(0, 20).map((tool) => this.toolRow(t, tool)))
        .when(turn.tools.length > 20, (list) => list.child(
          div().text_size(11).text_color(t.dim)
            .child(`Showing first 20 / ${turn.tools.length} · demo limit`)))));
  }

  userMessage(t, turn) {
    return v_flex().id(`agent-ui-user-${turn.id}`).w_full().gap(6)
      .px(12).py(11).rounded(9).bg(t.raised)
      .border_1().border_color(t.border)
      .child(div().text_size(10.5).font_semibold().text_color(t.dim).child("You"))
      .child(markdown(t, `agent-ui-prompt-${turn.id}`, turn.prompt));
  }

  turn(t, turn) {
    return v_flex().id(`agent-ui-turn-${turn.id}`).w_full().gap(13)
      .on_size_change((size, cx) => this.measureTurn(turn.id, size, cx))
      .child(this.userMessage(t, turn))
      .child(v_flex().w_full().gap(9).px(4)
        .child(div().text_size(10.5).font_semibold().text_color(t.accent).child("Pi"))
        .children(turn.messages.map((message) =>
          markdown(t, `agent-ui-message-${message.id}`, message.text)))
        .when(turn.tools.length > 0, (el) => el.child(this.activity(t, turn))))
      .child(div().w_full().h(1).bg(t.border));
  }

  rail(t, geometry, visible) {
    const nodes = toRailNodes(this.turns);
    const marks = railMarkers(geometry.ranges, geometry.total, this.viewportHeight);
    const byId = new Map(marks.map((mark) => [mark.id, mark]));
    return div().id("agent-ui-rail").w(29).flex_none().h_full()
      .relative().overflow_hidden()
      .children(nodes.map((node) =>
        h_flex().id(`agent-ui-rail-marker-${node.id}`).w(23).h(16).absolute()
          .left(4).top(byId.get(node.id)?.top ?? 7)
          .items_center().justify_center().rounded(6)
          .cursor_pointer()
          .on_hover((on, cx) => this.showHover(node.id, on, cx))
          .on_click((_event, cx) => this.selectTurn(node.id, cx))
          // Every turn intersecting the viewport gets a larger CIRCLE,
          // aligned on the same centerline. Tool state never changes pins.
          .child(div().size(visible.has(node.id) ? 8 : 4).rounded(999)
            .bg(visible.has(node.id) ? t.muted : t.dim))));
  }

  hoverPreview(t, geometry) {
    if (!this.hoveredTurn) return null;
    const nodes = toRailNodes(this.turns);
    const node = nodes.find((item) => item.id === this.hoveredTurn);
    if (!node) return null;
    if (this.viewportHeight < (node.actionable ? 60 : 44)) return null;
    const mark = railMarkers(geometry.ranges, geometry.total, this.viewportHeight)
      .find((item) => item.id === this.hoveredTurn);
    if (!mark) return null;
    return v_flex().id("agent-ui-rail-preview").absolute().right(36)
      // Keep preview wholly inside the conversation viewport, even for the
      // first/last marker. The containing main area clips excess pixels.
      .top(previewTop(mark.top, this.viewportHeight, node.actionable))
      .w(207).px(11).py(9).gap(5)
      .rounded(7).bg(t.popover).border_1().border_color(t.border)
      .child(div().text_size(11.5).text_color(t.foreground)
        .truncate().child(shortPrompt(node.preview, 39)))
      .when(node.actionable, (el) => el.child(
        div().text_size(10.5).text_color(t.blocked).child("! 需要處理")));
  }

  render(cx) {
    const t = theme();
    const compact = this.width < 520;
    const railEnabled = !compact && this.viewportHeight >= 80;
    const draft = String(this.composer.value() ?? "").trim();
    const geometry = turnGeometry(this.turns, this.turnHeights);
    this.scrollY = clampScroll(this.scrollY, geometry.total, this.viewportHeight);
    const visible = new Set(visibleTurnIds(geometry.ranges, this.scrollY, this.viewportHeight));
    return v_flex().id("agent-ui-root").size_full().min_h(0)
      // A Layout Stack child, not an independent Pane. Mimic the native
      // card frame here, without introducing a second host Pane Frame.
      .rounded(10).overflow_hidden().border_1().border_color(t.border).bg(t.background)
      .text_color(t.foreground)
      .on_size_change((size, context) => this.changeSize(size, context))
      .child(h_flex().id("agent-ui-header").h(38).flex_none().px(12).gap(9)
        .items_center().border_b(1).border_color(t.border)
        .child(div().flex_1().text_size(12.5).font_semibold().child("Pi · Conversation"))
        .child(this.statusLine(t, this.turns.at(-1).status))
        .child(div().text_color(t.dim).text_size(10).child("DEMO")))
      .child(h_flex().id("agent-ui-main").flex_1().min_h(0)
        .relative().overflow_hidden()
        .on_scroll_wheel((event, context) => this.scrollWheel(event, context))
        .child(div().id("agent-ui-viewport").flex_1().min_w(0).h_full()
          .relative().overflow_hidden()
          .on_size_change((size, context) => this.measureViewport(size, context))
          .child(v_flex().id("agent-ui-transcript").absolute()
            .left(0).right(0).top(-this.scrollY)
            .px(compact ? 13 : 23).py(18).gap(19)
            .children(this.turns.map((turn) => this.turn(t, turn)))))
        .when(railEnabled, (el) => el.child(this.rail(t, geometry, visible)))
        .when(railEnabled && Boolean(this.hoveredTurn),
          (el) => el.child(this.hoverPreview(t, geometry))))
      .child(v_flex().id("agent-ui-composer").flex_none().px(compact ? 13 : 21)
        .pt(10).pb(12).gap(8).border_t(1).border_color(t.border).bg(t.chrome)
        .child(Textarea.new(this.composer).id("agent-ui-textarea").w_full()
          .h(compact ? 70 : 78).p(10).rounded(8)
          .border_1().border_color(t.input)
          .bg(t.background).text_color(t.foreground).text_size(12.5))
        .child(h_flex().items_center().gap(9)
          .child(div().flex_1().text_size(10.5).text_color(t.dim)
            .child(this.notice || "Synthetic data · no live Pi connection"))
          .child(control(t, "agent-ui-send", "Try send · demo",
            (context) => this.send(context), Boolean(draft)))));
  }
}
