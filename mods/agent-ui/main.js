// @ts-check
// Agent UI · standalone synthetic GPUI demo. NEVER starts or controls Pi.
import { View, div, svg, PathBuilder, Background } from "gpui-kit";
import { h_flex, v_flex, TextView, TextareaState, Textarea } from "gpui-base";
import { theme, appHome, closeOverlay, exec, home, notify, props, readTextFile, shared, watchFolder, writeTextFile } from "herdr";
import { DEMO_TURNS, fixtureSource } from "./fixtures.js";
import { SOURCE_KEY, createBridgeSource } from "./bridge-source.js";
import { applyEvent, createTranscript } from "./state.js";
import {
  summarizeActivity, toRailNodes, shortPrompt, turnGeometry, clampScroll,
  visibleTurnIds, railLayout, railHit, railScrubOffset, previewTop,
  turnUsage, formatUsage,
} from "./model.js";

const STATUSES = {
  working: ["Working", "working"],
  done: ["Completed", "muted"],
  "needs-input": ["Needs attention", "blocked"],
};

// Herdr's own mods ship Lucide outline icons and tint them with text_color; a
// glyph from a Nerd Font instead depends on the reader having that font.
function icon(name, size) {
  return svg(`mods/agent-ui/icons/${name}.svg`).size(size).flex_none();
}

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
  const kind = String(tool?.kind ?? "");
  // An unknown kind is shown as it is; never silently relabel it as a known tool.
  return names[kind] ?? (kind ? kind.toUpperCase() : "Tool");
}

const DETAIL_LINES = 18;
const DETAIL_CHARS = 4000;
const FADE_RECT = PathBuilder.fill().move_to("0%", "0%")
  .line_to("100%", "0%").line_to("100%", "100%")
  .line_to("0%", "100%").close().build();

export default class AgentUi extends View {
  init(_props, cx) {
    // One source, one reducer: a bridge later supplies the same shape of events.
    this.source = fixtureSource(DEMO_TURNS);
    this.bridge = null;
    this.bridgeHealth = null;
    this.asking = null;
    this.askPicks = {};
    this.askTyping = -1;
    this.askCursor = 0;
    this.askHover = -1;
    this.answer = TextareaState.new({ value: "", rows: 2, placeholder: "Type your answer…" });
    this.answer.on("change", (_event, cx) => cx.notify());
    // null until the check runs: "unknown" is not "not installed".
    this.bridgeInstalled = null;
    this.transcript = createTranscript(this.source.snapshot());
    // Herdr Mod guide: cx.focus_handle() in init, .track_focus(h), h.focus().
    this.h = cx.focus_handle();
    this.hoveredTurn = null;
    this.keyTurn = null;
    this.turnList = false;
    this.groupOpen = new Set();
    this.toolOpen = new Set();
    this.turnHeights = new Map();
    this.viewportHeight = 460;
    this.scrollY = 0;
    this.railGesture = null;
    this.pendingJump = null;
    this.width = 800;
    this.localCount = 0;
    this.notice = "";
    // Demo-only states. "offline" is the bridge-error case, "empty" the
    // before-any-turn case; both are reachable with one click on the chip.
    this.demo = "demo";
    this.saved = null;
    this.stick = false;
    this.newTurns = 0;
    this.live = 0;
    // Pacing needs a clock, and Mods have no setTimeout: cx.timer is the only
    // documented tick. It returns at once when nothing is streaming, so the
    // cost is one no-op callback per 140ms, not a redraw.
    cx.timer.every(140, (context) => this.tick(context));
    this.composer = TextareaState.new({
      value: "",
      rows: 3,
      placeholder: "Message (demo only — nothing is sent)",
    });
    this.composer.on("change", (_event, cx) => cx.notify());
    this.attachBridge(cx);
  }

  // The bridge is opt-in: a layout asks for it with shared("agent-ui-source").
  // A Mod has neither env nor readdir, so discovery is one `ls -1t` and the
  // waiting is watchFolder -- never a timer poll.
  attachBridge(cx) {
    if (typeof shared !== "function" || shared(SOURCE_KEY) !== "bridge") return;
    const root = () => `${appHome()}/agent-ui/bridge`;
    const host = {
      async find() {
        let listing;
        try {
          listing = await exec("ls", ["-1t", root()]);
        } catch {
          return null; // no bridge folder yet: nothing has ever run
        }
        const name = String(listing.stdout ?? "").split("\n").map((line) => line.trim())
          .filter(Boolean)[0];
        return name ? `${root()}/${name}` : null;
      },
      async read(dir) {
        const parse = (text) => {
          try {
            return text ? JSON.parse(text) : null;
          } catch {
            return null; // a half-written file is a retry, not a crash
          }
        };
        const [meta, done, live] = await Promise.all([
          readTextFile(`${dir}/meta.json`),
          readTextFile(`${dir}/done.json`),
          readTextFile(`${dir}/live.json`),
        ]);
        return { meta: parse(meta), done: parse(done), live: parse(live) };
      },
      watch(dir) {
        return watchFolder(dir);
      },
    };
    this.bridge = createBridgeSource(host);
    this.source = this.bridge;
    cx.spawn(async (context) => {
      try {
        this.bridgeInstalled = await readTextFile(
          `${home()}/.pi/agent/extensions/herdr-agent-ui.js`) !== null;
        for (;;) {
          if (await this.bridge.refresh()) this.pump(context);
          this.bridgeHealth = this.bridge.health;
          context.notify();
          await host.watch(this.bridge.dir ?? root());
        }
      } catch {
        // A dead watch ends the loop; the transcript stays readable.
        this.bridgeHealth = this.bridge.health;
      }
    });
  }

  get turns() {
    return this.transcript.turns;
  }

  set turns(next) {
    this.transcript.turns = next;
  }

  // Dropping the oldest turns must not move what is being read, so the turn that
  // was on top is put back on top. If that turn itself went, the offset stays put
  // and the view lands a little further down.
  restoreTop(top) {
    if (!top) return;
    const range = turnGeometry(this.turns, this.turnHeights).ranges
      .find((item) => item.id === top);
    if (range) this.scrollY = range.start;
    this.viewportTop = null;
  }

  anchor(kind) {
    if (this.stick) {
      const geometry = turnGeometry(this.turns, this.turnHeights);
      this.scrollY = clampScroll(geometry.total, geometry.total, this.viewportHeight);
      this.live = 0;
      this.newTurns = 0;
      return;
    }
    if (kind === "turn") this.newTurns += 1;
    else this.live += 1;
  }

  // Only a new turn can push the oldest ones out, and only at the limit.
  atLimit(event) {
    return event.type === "turn.start" && this.turns.length >= this.transcript.limit;
  }

  // The question comes from @hheei/pi-ask-user, which announces the open prompt
  // and closes it. Pi itself has no "waiting for you" event, so nothing here is
  // guessed.
  ask(asking) {
    const opened = this.asking === null && asking !== null;
    if (JSON.stringify(this.asking) !== JSON.stringify(asking)) {
      this.askPicks = {};
      this.askTyping = -1;
      this.askCursor = 0;
      this.askHover = -1;
      this.answer.set_value("");
    }
    this.asking = asking;
    if (!opened) return;
    try {
      notify({ title: "Pi is asking",
        body: shortPrompt(asking.questions?.[0]?.question ?? asking.heading ?? ""),
        level: "warning" });
    } catch {
      // A host without notifications still shows the banner.
    }
  }

  apply(event) {
    if (event.type === "asking") {
      const before = JSON.stringify(this.asking);
      this.ask(event.asking ?? null);
      return JSON.stringify(this.asking) !== before;
    }
    const top = this.atLimit(event)
      ? visibleTurnIds(turnGeometry(this.turns, this.turnHeights).ranges,
        this.scrollY, this.viewportHeight)[0]
      : null;
    const result = applyEvent(this.transcript, event);
    if (!result.changed) return false;
    this.transcript = result.state;
    const dropped = result.dropped ?? [];
    for (const id of dropped) this.turnHeights.delete(id);
    if (dropped.length > 0 && !this.stick) this.restoreTop(top);
    // A new turn is counted once; only deltas inside it count as live content.
    const kind = event.type === "turn.start" || event.type === "snapshot" ? "turn"
      : event.type === "message.delta" ? "content" : null;
    if (result.grew && kind) this.anchor(kind);
    return true;
  }

  pump(cx) {
    let changed = false;
    for (let event = this.source.take(); event; event = this.source.take()) {
      if (this.apply(event)) changed = true;
    }
    if (changed) cx.notify();
    return changed;
  }

  changeSize(size, cx) {
    const width = Math.round(size?.width ?? 800);
    if (Math.abs(width - this.width) >= 16) {
      this.width = width;
      if (width < 240) this.hoveredTurn = null;
      cx.notify();
    }
  }

  measureViewport(size, cx) {
    const height = Math.max(1, Math.round(size?.height ?? this.viewportHeight));
    if (Math.abs(height - this.viewportHeight) < 1) return;
    this.viewportHeight = height;
    this.railGesture = null;
    if (height < 80) this.hoveredTurn = null;
    const geometry = turnGeometry(this.turns, this.turnHeights);
    this.scrollY = clampScroll(this.scrollY, geometry.total, height);
    cx.notify();
  }

  setMode(mode, cx) {
    if (mode !== this.demo) {
      if (mode === "empty") {
        this.saved = this.turns;
        this.turns = [];
        this.scrollY = 0;
        this.stick = false;
      } else if (this.demo === "empty") {
        this.turns = this.saved ?? [];
        this.saved = null;
      }
      this.demo = mode;
    }
    this.newTurns = 0;
    this.keyTurn = null;
    this.hoveredTurn = null;
    this.turnList = false;
    cx.notify();
  }

  cycleMode(cx) {
    this.setMode(this.demo === "demo" ? "offline"
      : this.demo === "offline" ? "empty" : "demo", cx);
  }

  tick(cx) {
    // Time is a fixture concern; a bridge pushes its own events.
    if (this.source.step()) this.pump(cx);
  }

  demoAppend(cx) {
    this.source.arrive();
    this.pump(cx);
  }

  jumpToBottom(cx) {
    const geometry = turnGeometry(this.turns, this.turnHeights);
    this.scrollY = clampScroll(geometry.total, geometry.total, this.viewportHeight);
    this.pendingJump = null;
    this.stick = true;
    this.newTurns = 0;
    this.live = 0;
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
    if (this.stick) this.scrollY = clampScroll(after.total, after.total, this.viewportHeight);
    else this.scrollY = clampScroll(this.scrollY, after.total, this.viewportHeight);
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

  // The dots ARE the scrollbar: one shared scrollY and no second control.
  setRailScroll(value, cx) {
    const geometry = turnGeometry(this.turns, this.turnHeights);
    const next = clampScroll(value, geometry.total, this.viewportHeight);
    this.pendingJump = null;
    if (next === this.scrollY) return;
    this.scrollY = next;
    cx.notify();
  }

  railDragMove(event, cx) {
    const gesture = this.railGesture;
    if (!gesture) return;
    const screenY = Number(event?.position?.y);
    if (!Number.isFinite(screenY)) return;
    if (gesture.mode === "pin") {
      if (Math.abs(screenY - gesture.screenY) < 5) return;
      gesture.mode = "scrub";
      this.hoveredTurn = null;
    }
    const localY = screenY - gesture.originScreenY;
    const geometry = turnGeometry(this.turns, this.turnHeights);
    this.setRailScroll(railScrubOffset(localY, geometry.total, this.viewportHeight), cx);
    cx.stop_propagation();
  }

  cancelRailGesture(cx) {
    if (!this.railGesture) return;
    this.railGesture = null;
    cx.notify();
  }

  railPointer(event) {
    const y = Number.isFinite(Number(event?.local_position?.y))
      ? Number(event.local_position.y) : Number(event?.position?.y) - Number(event?.bounds?.y);
    const x = Number.isFinite(Number(event?.local_position?.x))
      ? Number(event.local_position.x) : Number(event?.position?.x) - Number(event?.bounds?.x);
    return { x, y };
  }

  railPress(event, cx) {
    const { x, y } = this.railPointer(event);
    const screenY = Number(event?.position?.y);
    if (!Number.isFinite(screenY) || !Number.isFinite(y)) return;
    const geometry = turnGeometry(this.turns, this.turnHeights);
    const layout = railLayout(geometry.ranges, this.viewportHeight,
      visibleTurnIds(geometry.ranges, this.scrollY, this.viewportHeight));
    const id = this.viewportHeight >= 80 ? railHit(layout.dots, x, y) : null;
    this.railGesture = {
      mode: id ? "pin" : "scrub", id, screenY, originScreenY: screenY - y,
    };
    this.hoveredTurn = null;
    if (!id) {
      // Empty space between dots also scrolls: no track/thumb is drawn.
      this.setRailScroll(railScrubOffset(y, geometry.total, this.viewportHeight), cx);
    }
    cx.stop_propagation();
  }

  railMove(event, cx) {
    if (this.railGesture) {
      this.railDragMove(event, cx);
      return;
    }
    if (this.viewportHeight < 80) return;
    const { x, y } = this.railPointer(event);
    const geometry = turnGeometry(this.turns, this.turnHeights);
    const layout = railLayout(geometry.ranges, this.viewportHeight,
      visibleTurnIds(geometry.ranges, this.scrollY, this.viewportHeight));
    const id = railHit(layout.dots, x, y);
    if (id !== this.hoveredTurn) {
      this.hoveredTurn = id;
      cx.notify();
    }
  }

  railRelease(cx) {
    const pressed = this.railGesture;
    if (!pressed) return;
    this.railGesture = null;
    if (pressed.mode === "pin") this.selectTurn(pressed.id, cx);
    cx.stop_propagation();
    cx.notify();
  }

  // Keyboard reaches the same information as hover: arrows move a rail dot, and
  // its preview is shown while that dot is the keyboard focus.
  keyDown(event, cx) {
    const key = String(event?.keystroke?.key ?? "").toLowerCase();
    if (!key) return;
    if (this.asking !== null) {
      this.askKey(key, cx);
      return;
    }
    const geometry = turnGeometry(this.turns, this.turnHeights);
    const layout = railLayout(geometry.ranges, this.viewportHeight,
      visibleTurnIds(geometry.ranges, this.scrollY, this.viewportHeight));
    if (key === "escape") {
      if (this.keyTurn === null && this.hoveredTurn === null && !this.turnList) return;
      this.keyTurn = null;
      this.hoveredTurn = null;
      this.turnList = false;
      cx.notify();
      return;
    }
    if (!layout.dots.length) return;
    const current = layout.dots.findIndex((dot) => dot.turnIds.includes(this.keyTurn));
    let next = current;
    if (key === "up") next = current < 0 ? layout.dots.length - 1 : Math.max(0, current - 1);
    else if (key === "down") next = current < 0 ? 0 : Math.min(layout.dots.length - 1, current + 1);
    else if (key === "home") next = 0;
    else if (key === "end") next = layout.dots.length - 1;
    else if (key === "enter" || key === "return") {
      if (!this.keyTurn) return;
      this.selectTurn(this.keyTurn, cx);
      return;
    } else return;
    this.keyTurn = layout.dots[next].id;
    // Moving the keyboard focus moves the reading position, so the packet and
    // the transcript stay together.
    const target = geometry.ranges.find((range) => range.id === this.keyTurn);
    if (target) this.scrollY = clampScroll(target.start, geometry.total, this.viewportHeight);
    this.hoveredTurn = null;
    cx.stop_propagation();
    cx.notify();
  }

  // Narrow or very short panes have no room for the strip; the same buckets are
  // offered as a short list instead of dropping navigation entirely.
  turnListPanel(t, layout) {
    const rows = Math.max(3, Math.floor((this.viewportHeight - 120) / 26));
    const nodes = toRailNodes(this.turns);
    return v_flex().id("agent-ui-turn-list").absolute().left(8).right(8).top(8)
      .px(8).py(6).gap(1).rounded(8)
      .bg(t.popover).border_1().border_color(t.border)
      .children(layout.dots.slice(0, rows).map((dot) => {
        const node = nodes.find((item) => item.id === dot.id);
        const grouped = dot.turnIds.length > 1 ? ` +${dot.turnIds.length - 1}` : "";
        return h_flex().id(`agent-ui-turn-list-${dot.id}`).h(24).w_full().gap(7)
          .items_center().cursor_pointer().rounded(5).px(5)
          .when(dot.visible, (el) => el.bg(t.raised))
          .on_click((_event, cx) => {
            this.turnList = false;
            this.selectTurn(dot.id, cx);
          })
          .child(div().flex_1().min_w(0).truncate().text_size(11.5)
            .text_color(t.foreground).child(shortPrompt(node?.preview ?? "", 32) + grouped));
      }))
      .when(layout.dots.length > rows, (el) => el.child(
        div().text_size(10.5).text_color(t.dim)
          .child(`+${layout.dots.length - rows} more turns · open a wider pane`)));
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
    if (this.demo !== "demo") {
      this.notice = this.demo === "offline"
        ? "Bridge offline · nothing was sent or queued"
        : "No session to send to";
      cx.notify();
      return;
    }
    const id = `t-local-${++this.localCount}`;
    const messageId = `a-local-${this.localCount}`;
    this.apply({ type: "turn.start", turn: { id, prompt: draft } });
    this.apply({ type: "message.start", turnId: id, message: { id: messageId } });
    this.apply({ type: "message.end", turnId: id, messageId,
      text: "**Local preview only.** This message was not sent to Pi. Your running Agent was not touched." });
    this.apply({ type: "turn.end", turnId: id });
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
    const raw = String(tool.detail ?? "No details available.");
    const detail = raw.slice(0, DETAIL_CHARS);
    const lines = raw.split("\n");
    const shown = detail.split("\n").slice(0, DETAIL_LINES);
    const truncated = lines.length > shown.length || raw.length > detail.length;
    const partial = String(tool.kind ?? "") === "edit" && !detail.includes("@@");
    const headings = {
      read: "File excerpt",
      search: "Matches and source",
      exec: "Command output",
      edit: "Patch preview",
      custom: "Integration information",
    };
    const title = headings[tool.kind] ?? `Tool result · ${String(tool.kind ?? "unknown")}`;
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
      .children(shown.map((line, i) =>
        div().id(`agent-ui-detail-line-${tool.id}-${i}`).text_size(11.5)
          .text_color(tool.kind === "edit" && line.startsWith("+") ? (t.done || t.accent)
            : tool.kind === "edit" && line.startsWith("-") ? t.blocked : t.muted)
          .child(line || " ")))
      // A partial patch and a truncated log are different problems; say which.
      .when(partial, (el) => el.child(div().id(`agent-ui-detail-partial-${tool.id}`)
        .text_size(10.5).text_color(t.working)
        .child("Patch preview is partial · no hunk header in this fixture")))
      .when(truncated, (el) => el.child(div().id(`agent-ui-detail-more-${tool.id}`)
        .text_size(10.5).text_color(t.dim)
        .child(`Preview shows ${shown.length} of ${lines.length} lines · full output stays in the Terminal`)));
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
        .child(h_flex().w(10).flex_none().items_center().text_color(color)
          .child(tool.status === "done" ? icon("check", 11)
            : div().text_size(11).child(tool.status === "failed" ? "!" : "·")))
        .child(div().w(41).flex_none().text_size(11).text_color(t.dim).child(toolLabel(tool)))
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.foreground)
          .child(tool.target || tool.title))
        .child(div().text_size(10.5).text_color(color).child(status))
        .child(h_flex().w(10).flex_none().items_center().text_color(t.dim)
          .child(icon(expanded ? "chevron-down" : "chevron-right", 11))))
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
        .child(h_flex().w(12).flex_none().items_center().text_color(t.dim)
          .child(icon(open ? "chevron-down" : "chevron-right", 11)))
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
    if (turn.kind === "marker") {
      return h_flex().id(`agent-ui-turn-${turn.id}`).w_full().items_center().gap(9)
        .on_size_change((size, cx) => this.measureTurn(turn.id, size, cx))
        .child(div().flex_1().h(1).bg(t.border))
        .child(div().text_size(10).text_color(t.dim).child(turn.prompt))
        .child(div().flex_1().h(1).bg(t.border));
    }
    const usage = formatUsage(turnUsage(turn));
    return v_flex().id(`agent-ui-turn-${turn.id}`).w_full().gap(13)
      .on_size_change((size, cx) => this.measureTurn(turn.id, size, cx))
      .child(this.userMessage(t, turn))
      .child(v_flex().w_full().gap(9).px(4)
        .child(h_flex().items_center().gap(8)
          .child(div().text_size(10.5).font_semibold().text_color(t.accent).child("Pi"))
          .when(usage !== "", (el) => el.child(div().id(`agent-ui-usage-${turn.id}`)
            .text_size(10).text_color(t.dim).child(usage))))
        .children(turn.messages.map((message) =>
          markdown(t, `agent-ui-message-${message.id}`, message.text)))
        .when(turn.tools.length > 0, (el) => el.child(this.activity(t, turn))))
      .child(div().w_full().h(1).bg(t.border));
  }

  navigationStrip(t, geometry, visible, showPins) {
    const layout = railLayout(geometry.ranges, this.viewportHeight, [...visible]);
    return div().id("agent-ui-rail").w(18).flex_none().h_full()
      .relative().overflow_hidden().cursor_pointer()
      .on_mouse_down("left", (event, cx) => this.railPress(event, cx))
      .on_mouse_move((event, cx) => this.railMove(event, cx))
      .on_mouse_up("left", (_event, cx) => this.railRelease(cx))
      .on_hover((hovered, cx) => {
        if (!hovered && this.hoveredTurn !== null) {
          this.hoveredTurn = null;
          cx.notify();
        }
      })
      // One fixed column, 3px from the right edge, 3px apart, never taller than
      // 40% of the view.
      .when(showPins, (el) => el.children(layout.dots.map((dot) =>
        h_flex().id(`agent-ui-rail-marker-${dot.id}`).w(18).h(layout.pitch).absolute()
          .left(0).top(dot.center - layout.pitch / 2)
          .items_center().justify_end().pr(3).rounded(6)
          // Size is the Gaussian focus packet; the fill only says "on screen",
          // and the keyboard-focused dot is drawn solid so focus is visible.
          .child(div().size(dot.size).rounded(999)
            .when(this.keyTurn && dot.turnIds.includes(this.keyTurn),
              (el) => el.opacity(1).bg(t.accent))
            .when(!(this.keyTurn && dot.turnIds.includes(this.keyTurn)),
              (el) => el.opacity(0.7).bg(dot.visible ? t.muted : t.dim))))));
  }

  hoverPreview(t, geometry) {
    const target = this.hoveredTurn ?? this.keyTurn;
    if (!target) return null;
    const nodes = toRailNodes(this.turns);
    const node = nodes.find((item) => item.id === target);
    if (!node || this.width < 240) return null;
    if (this.viewportHeight < (node.actionable ? 60 : 44)) return null;
    const layout = railLayout(geometry.ranges, this.viewportHeight,
      visibleTurnIds(geometry.ranges, this.scrollY, this.viewportHeight));
    const dot = layout.dots.find((item) => item.turnIds.includes(target));
    if (!dot) return null;
    const grouped = dot.turnIds.length > 1 ? ` +${dot.turnIds.length - 1}` : "";
    return v_flex().id("agent-ui-rail-preview").absolute().right(22)
      // Keep preview wholly inside the conversation viewport, even for the
      // first/last marker. The containing main area clips excess pixels.
      .top(previewTop(dot.center - layout.pitch / 2, this.viewportHeight, node.actionable))
      .w(Math.min(207, this.width - 30)).px(11).py(9).gap(5)
      .rounded(7).bg(t.popover).border_1().border_color(t.border)
      .child(div().text_size(11.5).text_color(t.foreground)
        .truncate().child(shortPrompt(node.preview, 39) + grouped))
      .when(node.actionable, (el) => el.child(
        div().text_size(10.5).text_color(t.blocked).child("! Needs you")));
  }

  // No turns is a real state, not a spinner forever; say what is missing.
  emptyState(t) {
    return v_flex().id("agent-ui-empty").size_full().items_center().justify_center()
      .gap(7).px(18)
      .child(div().text_size(13).text_color(t.muted).child("No turns yet"))
      .child(div().text_size(11).text_color(t.dim)
        .child("Nothing has arrived from the bridge, so there is no transcript to show."))
      .child(control(t, "agent-ui-empty-restore", "Restore demo turns",
        (context) => this.setMode("demo", context), true));
  }

  render(cx) {
    const t = /** @type {Record<string, import("gpui-kit").Color>} */ (theme());
    const fadeBase = /^#[0-9a-f]{6}$/i.test(t.background) ? t.background : "#000000";
    const compact = this.width < 520;
    // The strip needs both room and height; without them the list takes over.
    const railEnabled = this.viewportHeight >= 80 && this.width >= 240;
    const listEnabled = !railEnabled && this.viewportHeight >= 60;
    const draft = String(this.composer.value() ?? "").trim();
    const geometry = turnGeometry(this.turns, this.turnHeights);
    this.scrollY = clampScroll(this.scrollY, geometry.total, this.viewportHeight);
    const visible = new Set(visibleTurnIds(geometry.ranges, this.scrollY, this.viewportHeight));
    const last = this.turns.at(-1);
    // Sticky bottom: content growth follows only while the reader is at the end.
    const maxY = clampScroll(geometry.total, geometry.total, this.viewportHeight);
    this.stick = geometry.total <= this.viewportHeight + 1 || this.scrollY >= maxY - 2;
    if (this.stick && this.scrollY < maxY) {
      this.scrollY = maxY;
      this.newTurns = 0;
    }
    return v_flex().id("agent-ui-root").size_full().min_h(0)
      // A Layout Stack child, not an independent Pane. Mimic the native
      // card frame here, without introducing a second host Pane Frame.
      .rounded(10).overflow_hidden().border_1().border_color(t.border).bg(t.background)
      .text_color(t.foreground)
      .track_focus(this.h)
      .on_key_down((event, context) => this.keyDown(event, context))
      .on_size_change((size, context) => this.changeSize(size, context))
      .child(h_flex().id("agent-ui-header").h(38).flex_none().px(12).gap(9)
        .items_center().border_b(1).border_color(t.border)
        .child(div().flex_1().text_size(12.5).font_semibold().child("Pi · Conversation"))
        .when(listEnabled, (el) => el.child(control(t, "agent-ui-turn-list-toggle",
          this.turnList ? "Close" : "Turns", (context) => {
            this.turnList = !this.turnList;
            context.notify();
          }, this.turns.length > 0)))
        .when(this.width >= 520 && Boolean(last), (el) => el.child(control(t,
          "agent-ui-append-turn", "+ turn", (context) => this.demoAppend(context), true)))
        .when(Boolean(last), (el) => el.child(this.statusLine(t, last.status)))
        .when(Boolean(this.bridge) && this.bridgeHealth !== "live" && this.demo === "demo",
          (el) => el.child(div().id("agent-ui-bridge-health").text_size(10).text_color(t.blocked)
            .truncate().child(`bridge ${this.bridgeHealth ?? "…"}`)))
        .child(h_flex().id("agent-ui-demo-state").h(24).px(8).items_center().rounded(6)
          .cursor_pointer().border_1().border_color(t.border)
          .on_click((_event, context) => this.cycleMode(context))
          .child(div().text_size(10)
            .text_color(this.demo === "demo" ? t.dim : t.blocked)
            .child(this.demo.toUpperCase())))
        .when(Boolean(props()?.overlay), (el) => el.child(h_flex().id("agent-ui-close")
          .h(24).w(24).flex_none().items_center().justify_center().rounded(6)
          .border_1().border_color(t.border).cursor_pointer()
          .on_click(() => closeOverlay(props().overlay))
          .child(icon("x", 13)))))
      .when(this.bridge && this.bridgeInstalled === false, (el) => el.child(h_flex()
        .id("agent-ui-bridge-missing").h(27).flex_none().px(12).gap(9).items_center()
        .bg(t.raised).border_b(1).border_color(t.border)
        .child(div().flex_1().truncate().text_size(11).text_color(t.blocked)
          .child("! Pi GUI integration is not enabled · copy bridge/herdr-agent-ui.js into ~/.pi/agent/extensions/ and restart Pi"))))
      .when(this.demo === "offline", (el) => el.child(h_flex().id("agent-ui-offline")
        .h(27).flex_none().px(12).gap(9).items_center().bg(t.raised)
        .border_b(1).border_color(t.border)
        .child(div().flex_1().truncate().text_size(11).text_color(t.blocked)
          .child("! Pi bridge offline · the transcript is read-only and nothing is queued"))
        .child(control(t, "agent-ui-reconnect", "Retry",
          (context) => this.setMode("demo", context), true))))
      .child(h_flex().id("agent-ui-main").flex_1().min_h(0)
        .relative().overflow_hidden()
        .on_scroll_wheel((event, context) => this.scrollWheel(event, context))
        .on_mouse_move((event, context) => this.railDragMove(event, context))
        .on_mouse_up("left", (_event, context) => this.railRelease(context))
        .on_hover((hovered, context) => {
          if (!hovered && this.railGesture) this.cancelRailGesture(context);
        })
        .child(div().id("agent-ui-viewport").flex_1().min_w(0).h_full()
          .relative().overflow_hidden()
          .on_size_change((size, context) => this.measureViewport(size, context))
          .when(this.turns.length > 0, (el) => el.child(v_flex().id("agent-ui-transcript")
            .absolute().left(0).right(0).top(-this.scrollY)
            .px(compact ? 13 : 23).py(18).gap(19)
            .children(this.turns.map((turn) => this.turn(t, turn)))))
          .when(this.turns.length === 0, (el) => el.child(this.emptyState(t)))
          .when(this.turns.length > 0 && this.viewportHeight >= 80, (el) => el.child(
            window.paint_path(FADE_RECT, Background.linear_gradient(180,
              `${fadeBase}00`, `${fadeBase}88`))
              .id("agent-ui-bottom-fade").absolute().bottom(0).left(0).right(0).h(54))))
        .when(railEnabled, (el) =>
          el.child(this.navigationStrip(t, geometry, visible, true)))
        .when(railEnabled && Boolean(this.hoveredTurn ?? this.keyTurn),
          (el) => el.child(this.hoverPreview(t, geometry)))
        .when(listEnabled && this.turnList, (el) => el.child(this.turnListPanel(t,
          railLayout(geometry.ranges, this.viewportHeight, [...visible]))))
        .when(this.newTurns > 0 || this.live > 0, (el) => el.child(h_flex().id("agent-ui-new-turns")
          .absolute().bottom(10).left(0).right(0).justify_center()
          .child(h_flex().id("agent-ui-new-turns-pill").h(24).px(10).gap(6)
            .items_center().rounded(12).bg(t.accent).cursor_pointer()
            .on_click((_event, context) => this.jumpToBottom(context))
            .child(icon("arrow-down", 10).text_color(t.background))
            .child(div().text_size(10.5).text_color(t.background)
              .child(this.live > 0 ? "live" : `${this.newTurns} new`))))))
      .child(this.asking !== null
        ? this.askPanel(t, compact)
        : this.composerArea(t, compact));
  }

  composerArea(t, compact) {
    const draft = String(this.composer.value() ?? "").trim();
    return v_flex().id("agent-ui-composer-wrap").flex_none().px(compact ? 10 : 20).pt(10).pb(14)
      .child(v_flex().id("agent-ui-composer").w_full().p(compact ? 12 : 16).gap(10)
        .rounded(18).border_1().border_color(t.border).bg(t.background).shadow_sm()
        .child(Textarea.new(this.composer).id("agent-ui-textarea").w_full()
          .h(compact ? 66 : 84).p(4).bg(t.background)
          .text_color(t.foreground).text_size(13.5))
        .child(h_flex().items_center().gap(9)
          .child(div().flex_1().text_size(10.5).text_color(t.dim)
            .child(this.notice || (this.demo === "demo"
              ? "Synthetic data · no live Pi connection"
              : "Read-only in this state · the draft is kept")))
          .when(this.width >= 520 && this.demo === "demo", (el) => el.child(control(t,
            "agent-ui-stream", h_flex().gap(5).items_center()
              .child(icon(this.source.streaming() ? "square" : "play", 11))
              .child(div().child(this.source.streaming() ? "finish" : "stream")),
            (context) => {
              if (this.source.streaming()) this.source.finish();
              else this.source.replay();
              this.pump(context);
            }, true)))
          .child(this.pill(t, "agent-ui-send", "Try send · demo",
            (context) => this.send(context), Boolean(draft) && this.demo === "demo", true))));
  }

  // Questions and ordinary drafts share one rounded composer shell. Only real
  // actions appear here: no attachment, voice or model controls without a host API.
  askPanel(t, compact) {
    const asked = this.asking.questions ?? [];
    const one = asked.length === 1 ? asked[0] : null;
    const picks = (index) => this.askPicks[index] ?? [];
    const rows = [];
    let flat = 0;
    for (const [index, question] of asked.entries()) {
      const multi = asked.length > 1;
      rows.push(h_flex().id(`agent-ui-ask-head-${index}`).gap(8).items_center()
        .pt(index ? 10 : 2).pb(8)
        .when(multi, (el) => el.child(h_flex().flex_none().h(22).px(7).rounded(6)
          .items_center().bg(t.raised)
          .child(div().text_size(10.5).text_color(t.dim)
            .child(`${index + 1}/${asked.length}`))))
        .child(div().flex_1().min_w(0).text_size(compact ? 13 : 14).font_semibold()
          .text_color(t.foreground).child(question.question))
        .when(index === 0, (el) => el.child(h_flex().id("agent-ui-ask-cancel")
          .w(27).h(27).flex_none().items_center().justify_center().rounded(7)
          .cursor_pointer().on_click((_event, context) => this.cancelAsk(context))
          .child(icon("x", 15).text_color(t.dim)))));
      if (question.context)
        rows.push(div().id(`agent-ui-ask-context-${index}`).pl(multi ? 33 : 0).pb(7).text_size(11.5)
          .text_color(t.dim).child(question.context));
      const list = [];
      for (const [slot, option] of (question.options ?? []).entries()) {
        const on = picks(index).includes(option.title);
        const at = flat++;
        const focus = this.askCursor === at;
        list.push(h_flex().id(`agent-ui-ask-${index}-${slot}`)
          .min_h(option.description ? (compact ? 76 : 68) : 47).px(12).gap(12)
          .items_center().rounded(11).cursor_pointer()
          .when(focus || on || this.askHover === at, (el) => el.bg(t.raised))
          .on_hover((hovered, context) => {
            const next = hovered ? at : -1;
            if (this.askHover !== next) { this.askHover = next; context.notify(); }
          })
          .on_click((_event, context) => this.pickAnswer(index, option.title, context))
          .child(h_flex().flex_none().w(26).h(26).items_center().justify_center()
            .rounded(7).border_1().border_color(focus || on ? t.foreground : t.border)
            .bg(focus || on ? t.foreground : t.raised)
            .child(div().text_size(11.5)
              .text_color(focus || on ? t.background : t.dim).child(`${slot + 1}`)))
          .child(v_flex().flex_1().min_w(0).gap(3)
            .child(div().text_size(12.5).font_semibold()
              .text_color(t.foreground).child(option.title))
            .when(Boolean(option.description), (el) => el.child(div().text_size(11.5)
              .text_color(t.dim).child(option.description))))
          .child(icon(question.allowMultiple && on ? "check" : "chevron-right", 15)
            .text_color(t.dim)));
      }
      if (question.allowFreeform && !one) {
        const focus = this.askCursor === flat++;
        list.push(this.askTyping === index
          ? Textarea.new(this.answer).id(`agent-ui-ask-input-${index}`).w_full()
            .h(compact ? 46 : 52).p(8).rounded(6).border_1().border_color(t.input)
            .bg(t.chrome).text_color(t.foreground).text_size(12)
          : h_flex().id(`agent-ui-ask-free-${index}`).h(44).px(12).gap(11).items_center()
            .rounded(10).cursor_pointer()
            .when(focus, (el) => el.bg(t.raised))
            .on_click((_event, context) => this.typeAnswer(index, context))
            .child(icon("pencil", 14).text_color(t.dim))
            .child(div().text_size(12.5).text_color(t.dim)
              .child("Type your own answer")));
      }
      if (list.length) rows.push(...list);
    }

    const instant = Boolean(one) && !one.allowMultiple;
    const typed = one?.allowFreeform ? String(this.answer.value() ?? "").trim() : "";
    const ready = asked.length > 0 && asked.every((question, index) =>
      picks(index).length > 0 || (index === 0 && typed !== "")
        || (this.askTyping === index && String(this.answer.value() ?? "").trim() !== ""));
    return v_flex().id("agent-ui-composer-wrap").flex_none().px(compact ? 10 : 20).pt(10).pb(14)
      .child(v_flex().id("agent-ui-composer").w_full().p(compact ? 12 : 16).gap(12)
        .rounded(18).border_1().border_color(t.border).bg(t.background).shadow_sm()
        .child(v_flex().id("agent-ui-ask").w_full().flex_none().gap(4).children(rows))
        .child(one?.allowFreeform
          ? h_flex().id("agent-ui-ask-free-0").h(43).items_center().gap(9)
            .child(icon("pencil", 14).text_color(t.dim))
            .child(Textarea.new(this.answer).id("agent-ui-ask-input-0")
              .flex_1().min_w(0).h(40).p(6).bg(t.background)
              .text_color(t.foreground).text_size(12.5))
            .child(this.pill(t, "agent-ui-ask-send", ready ? "Send" : "Skip",
              (context) => ready ? this.sendAnswer(context) : this.cancelAsk(context), true, ready))
          : h_flex().items_center().gap(9)
            .child(div().flex_1().text_size(10.5).text_color(t.dim)
              .child(this.asking.heading && asked.length > 1 ? this.asking.heading
                : instant ? "Choose an option · Esc to dismiss"
                : one?.allowMultiple ? "Pick any · then send" : "Answer each one · then send"))
            .when(!instant, (el) => el.child(this.pill(t, "agent-ui-ask-send", "Send",
              (context) => this.sendAnswer(context), ready, true)))));
  }

  // Two weights, the same shape as the rest of the view: a flat pill for a
  // secondary action, a filled one for the action that finishes the prompt.
  pill(t, id, label, onClick, enabled, primary) {
    return h_flex().id(id).h(30).px(13).rounded(15).items_center()
      .bg(!enabled ? t.raised : primary ? t.foreground : t.background)
      .border_1().border_color(enabled && primary ? t.foreground : t.border)
      .text_size(11.5)
      .when(enabled, (el) => el.cursor_pointer()
        .on_click((_event, context) => onClick(context)))
      .child(div().text_size(11.5)
        .text_color(!enabled ? t.dim : primary ? t.background : t.foreground)
        .child(label));
  }

  // A click is the answer. For one single-choice question it goes out at once; a
  // multi-select or a batch collects first, because those have more than one step
  // and guessing when the user is done would be worse than a Send button.
  pickAnswer(index, title, cx) {
    const question = (this.asking?.questions ?? [])[index];
    if (!question) return;
    if ((this.asking.questions ?? []).length === 1 && !question.allowMultiple) {
      this.postAnswer({ response: { kind: "selection", selections: [title] } }, cx);
      return;
    }
    const picks = this.askPicks[index] ?? [];
    this.askPicks[index] = question.allowMultiple
      ? (picks.includes(title) ? picks.filter((item) => item !== title) : [...picks, title])
      : [title];
    cx.notify();
  }

  sendAnswer(cx) {
    const asked = this.asking?.questions ?? [];
    const answers = [];
    for (const [index, question] of asked.entries()) {
      const picks = this.askPicks[index] ?? [];
      const typed = (asked.length === 1 && question.allowFreeform) || this.askTyping === index
        ? String(this.answer.value() ?? "").trim() : "";
      if (!picks.length && !typed) return;
      answers.push({ status: "answered",
        response: typed ? { kind: "freeform", text: typed }
          : { kind: "selection", selections: picks } });
    }
    if (!answers.length) return;
    // A batch is answered as a whole, which is the shape the plugin's own batch
    // surface returns; a single question is just its response.
    this.postAnswer({ response: asked.length > 1 ? answers : answers[0].response }, cx);
  }

  cancelAsk(cx) {
    this.postAnswer({ cancel: true }, cx);
  }

  // The bridge owns delivery: this only writes the file, and the plugin that asked
  // resolves its own await with it. Optimistic close, because a banner that lingers
  // would look like a failed click.
  postAnswer(payload, cx) {
    const dir = this.bridge?.dir;
    this.asking = null;
    this.askPicks = {};
    this.askTyping = -1;
    this.askCursor = 0;
    this.askHover = -1;
    this.answer.set_value("");
    cx.notify();
    if (!dir) return;
    cx.spawn(async () => {
      await writeTextFile(`${dir}/answer.json`, JSON.stringify(payload), null);
    });
  }

  // The rows the cursor can land on, in render order: an option, then the freeform
  // row, question by question. Keys and clicks both resolve through this, so the
  // pointer on screen is always the row the keys would act on.
  askTargets() {
    const targets = [];
    for (const [index, question] of (this.asking?.questions ?? []).entries()) {
      for (const option of question.options ?? []) targets.push({ index, title: option.title });
      if (question.allowFreeform) targets.push({ index, freeform: true });
    }
    return targets;
  }

  askKey(key, cx) {
    if (key === "escape") {
      this.cancelAsk(cx);
      return;
    }
    const targets = this.askTargets();
    if (!targets.length) return;
    const at = Math.min(Math.max(this.askCursor, 0), targets.length - 1);
    const asked = this.asking?.questions ?? [];
    const digit = Number.parseInt(key, 10);
    if (Number.isInteger(digit) && digit >= 1) {
      if (!targets[digit - 1]) return;
      this.askCursor = digit - 1;
      this.choose(targets[digit - 1], cx);
      return;
    }
    if (key === "up" || key === "down") {
      this.askCursor = (at + (key === "up" ? targets.length - 1 : 1)) % targets.length;
      cx.notify();
      return;
    }
    if (key === " " || key === "space") {
      this.choose(targets[at], cx);
      return;
    }
    if (key !== "enter" && key !== "return") return;
    // Enter commits: a tick list needs it because ticking is not answering.
    if (asked.length > 1 || asked.some((question) => question.allowMultiple))
      this.sendAnswer(cx);
    else this.choose(targets[at], cx);
  }

  choose(target, cx) {
    if (target.freeform) this.typeAnswer(target.index, cx);
    else this.pickAnswer(target.index, target.title, cx);
  }

  typeAnswer(index, cx) {
    this.askTyping = index;
    this.askCursor = this.askTargets().findIndex((target) => target.freeform && target.index === index);
    cx.notify();
  }
}
