// Agent UI · standalone synthetic GPUI demo. NEVER starts or controls Pi.
import { View, div } from "gpui-kit";
import { h_flex, v_flex, TextView, TextareaState, Textarea } from "gpui-base";
import { theme } from "herdr";
import { DEMO_TURNS } from "./fixtures.js";
import { summarizeActivity, toRailNodes, shortPrompt, windowFromTurn } from "./model.js";

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
    this.activeTurn = this.turns[0].id;
    this.hoveredTurn = null;
    this.groupOpen = new Set();
    this.toolOpen = new Set();
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

  selectTurn(id, cx) {
    if (!this.turns.some((turn) => turn.id === id)) return;
    // GPUI does not document scroll-to-key; this demo replaces the
    // *visible transcript window* starting at this exact stable turn.
    // Real scroll-anchor geometry is still a host/runtime integration gate.
    this.activeTurn = id;
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
    const warning = data.failed > 0 || data.pending > 0;
    return v_flex().id(`agent-ui-activity-${turn.id}`).w_full().gap(7)
      .child(h_flex().id(`agent-ui-group-trigger-${turn.id}`).h(29)
        .w_full().gap(9).items_center().cursor_pointer()
        .on_click((_event, cx) => this.toggleGroup(turn.id, cx))
        .child(div().w(12).text_color(t.dim).child(open ? "⌄" : "›"))
        .child(div().flex_1().min_w(0).truncate().text_size(11.5)
          .text_color(t.muted).child(data.label))
        .child(div().flex_none().text_size(10.5)
          .text_color(warning ? t.blocked : data.running ? t.working : t.dim)
          .child(data.status)))
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
      .child(this.userMessage(t, turn))
      .child(v_flex().w_full().gap(9).px(4)
        .child(div().text_size(10.5).font_semibold().text_color(t.accent).child("Pi"))
        .children(turn.messages.map((message) =>
          markdown(t, `agent-ui-message-${message.id}`, message.text)))
        .when(turn.tools.length > 0, (el) => el.child(this.activity(t, turn))))
      .child(div().w_full().h(1).bg(t.border));
  }

  rail(t) {
    const nodes = toRailNodes(this.turns);
    return v_flex().id("agent-ui-rail").w(29).flex_none().h_full()
      .pt(16).gap(5).items_center()
      .children(nodes.slice(0, 20).map((node) =>
        h_flex().id(`agent-ui-rail-marker-${node.id}`).size(23).flex_none()
          .items_center().justify_center().rounded(6)
          .cursor_pointer()
          .on_hover((on, cx) => this.showHover(node.id, on, cx))
          .on_click((_event, cx) => this.selectTurn(node.id, cx))
          .child(div().w(this.activeTurn === node.id ? 13 : 9).h(3).rounded(2)
            .bg(node.actionable ? t.blocked
              : this.activeTurn === node.id ? t.accent : t.dim))));
  }

  hoverPreview(t) {
    if (!this.hoveredTurn) return null;
    const nodes = toRailNodes(this.turns);
    const at = nodes.findIndex((node) => node.id === this.hoveredTurn);
    if (at < 0) return null;
    const node = nodes[at];
    return v_flex().id("agent-ui-rail-preview").absolute().right(36)
      .top(16 + at * 28).w(207).px(11).py(9).gap(5)
      .rounded(7).bg(t.popover).border_1().border_color(t.border)
      .child(div().text_size(11.5).text_color(t.foreground)
        .truncate().child(shortPrompt(node.preview, 39)))
      .when(node.actionable, (el) => el.child(
        div().text_size(10.5).text_color(t.blocked).child("! 需要處理")));
  }

  render(cx) {
    const t = theme();
    const compact = this.width < 520;
    const active = this.turns.find((turn) => turn.id === this.activeTurn) || this.turns[0];
    const draft = String(this.composer.value() ?? "").trim();
    const turns = windowFromTurn(this.turns, active.id);
    return v_flex().id("agent-ui-root").size_full().min_h(0).bg(t.background)
      .text_color(t.foreground)
      .on_size_change((size, context) => this.changeSize(size, context))
      .child(h_flex().id("agent-ui-header").h(45).flex_none().px(17).gap(9)
        .items_center().border_b(1).border_color(t.border)
        .child(div().flex_1().text_size(13.5).font_semibold().child("Pi · Conversation"))
        .child(this.statusLine(t, this.turns.at(-1).status))
        .child(div().text_color(t.dim).text_size(10).child("DEMO")))
      .child(h_flex().id("agent-ui-main").flex_1().min_h(0).relative()
        .child(v_flex().id(`agent-ui-transcript-${active.id}`)
          .flex_1().min_w(0).min_h(0).overflow_y_scrollbar()
          .px(compact ? 13 : 23).py(18).gap(19)
          .when(active.id !== this.turns[0].id, (el) => el.child(
            h_flex().items_center().gap(8)
              .child(control(t, "agent-ui-show-earlier", "← Earlier turns",
                (context) => this.selectTurn(this.turns[0].id, context)))
              .child(div().text_size(10.5).text_color(t.dim).child("Demo window jump"))))
          .children(turns.map((turn) => this.turn(t, turn))))
        .when(!compact, (el) => el.child(this.rail(t)))
        .when(!compact && Boolean(this.hoveredTurn), (el) => el.child(this.hoverPreview(t))))
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
