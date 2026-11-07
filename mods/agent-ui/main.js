// @ts-check
// Agent UI · the view: one class, one source, one reducer. Drawing lives in
// transcript.js / rail.js / ask.js, gestures in scroll.js, building blocks in ui.js.
// Runs in Herdr's gpui-kit runtime, NOT a browser (no DOM, no timers).
import { Background, View, div } from "gpui-kit";
import { TextareaState, h_flex, v_flex } from "gpui-base";
import { appHome, closeOverlay, exec, home, notify, props, readTextFile, shared, theme, watchFolder } from "herdr";
import { DEMO_TURNS, fixtureSource } from "./fixtures.js";
import { SOURCE_KEY, createBridgeSource } from "./bridge-source.js";
import { applyEvent, createTranscript } from "./state.js";
import { clampScroll, railLayout, shortPrompt, turnGeometry, visibleTurnIds } from "./model.js";
import { FADE_RECT, control, icon } from "./ui.js";
import { statusLine, turn } from "./transcript.js";
import { emptyState, hoverPreview, navigationStrip, turnListPanel } from "./rail.js";
import { askPanel, composerArea, pill } from "./ask.js";
import { anchor, atLimit, cancelRailGesture, changeSize, cycleMode, demoAppend, jumpToBottom, keyDown, measureViewport, railDragMove, railRelease, restoreTop, scrollWheel, selectTurn, setMode, tick } from "./scroll.js";

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
    cx.timer.every(140, (context) => tick(this, context));
    this.composer = TextareaState.new({
      value: "",
      rows: 3,
      placeholder: "Message (demo only — nothing is sent)",
    });
    this.composer.on("change", (_event, cx) => cx.notify());
    this.attachBridge(cx);
  }

  // The bridge attaches by itself: opening the view should show the live Pi session
  // when there is one, and the synthetic history when there is not. shared() can
  // still force it either way ("bridge" even with nothing running, "demo" never).
  // A Mod has neither env nor readdir, so discovery is one `ls -1t` and the waiting
  // is watchFolder -- never a timer poll.
  attachBridge(cx) {
    if (typeof shared === "function" && shared(SOURCE_KEY) === "demo") return;
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
    const forced = typeof shared === "function" && shared(SOURCE_KEY) === "bridge";
    const attach = () => {
      this.bridge = createBridgeSource(host);
      this.source = this.bridge;
    };
    // An explicit "bridge" takes effect now, so the very first render is the bridge's.
    if (forced) attach();
    cx.spawn(async (context) => {
      try {
        this.bridgeInstalled = await readTextFile(
          `${home()}/.pi/agent/extensions/herdr-agent-ui.js`) !== null;
        // Nothing running and nobody insisting: keep the demo rather than an empty view.
        if (!this.bridge) {
          if ((await host.find()) === null) return;
          attach();
        }
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

  // Only a new turn can push the oldest ones out, and only at the limit.

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
    const top = atLimit(this, event)
      ? visibleTurnIds(turnGeometry(this.turns, this.turnHeights).ranges,
        this.scrollY, this.viewportHeight)[0]
      : null;
    const result = applyEvent(this.transcript, event);
    if (!result.changed) return false;
    this.transcript = result.state;
    const dropped = result.dropped ?? [];
    for (const id of dropped) this.turnHeights.delete(id);
    if (dropped.length > 0 && !this.stick) restoreTop(this, top);
    // A new turn is counted once; only deltas inside it count as live content.
    const kind = event.type === "turn.start" || event.type === "snapshot" ? "turn"
      : event.type === "message.delta" ? "content" : null;
    if (result.grew && kind) anchor(this, kind);
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

  // The dots ARE the scrollbar: one shared scrollY and no second control.

  // Keyboard reaches the same information as hover: arrows move a rail dot, and
  // its preview is shown while that dot is the keyboard focus.

  // Narrow or very short panes have no room for the strip; the same buckets are
  // offered as a short list instead of dropping navigation entirely.

  send(cx) {
    const draft = String(this.composer.value() ?? "").trim();
    if (!draft) return;
    // A Mod has no handle on the agent's terminal: the bridge is read-only except
    // for ask-user answers, so a typed prompt can only be previewed.
    if (this.source === this.bridge) {
      this.notice = "The bridge is read-only · send prompts from the Pi pane";
      cx.notify();
      return;
    }
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
    selectTurn(this, id, cx);
  }

  // No turns is a real state, not a spinner forever; say what is missing.

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
      .on_key_down((event, context) => keyDown(this, event, context))
      .on_size_change((size, context) => changeSize(this, size, context))
      .child(h_flex().id("agent-ui-header").h(38).flex_none().px(12).gap(9)
        .items_center().border_b(1).border_color(t.border)
        .child(div().flex_1().text_size(12.5).font_semibold().child("Pi · Conversation"))
        .when(listEnabled, (el) => el.child(control(t, "agent-ui-turn-list-toggle",
          this.turnList ? "Close" : "Turns", (context) => {
            this.turnList = !this.turnList;
            context.notify();
          }, this.turns.length > 0)))
        .when(this.width >= 520 && Boolean(last), (el) => el.child(control(t,
          "agent-ui-append-turn", "+ turn", (context) => demoAppend(this, context), true)))
        .when(Boolean(last), (el) => el.child(statusLine(this, t, last.status)))
        .when(Boolean(this.bridge) && this.bridgeHealth !== "live" && this.demo === "demo",
          (el) => el.child(div().id("agent-ui-bridge-health").text_size(10).text_color(t.blocked)
            .truncate().child(`bridge ${this.bridgeHealth ?? "…"}`)))
        .child(h_flex().id("agent-ui-demo-state").h(24).px(8).items_center().rounded(6)
          .cursor_pointer().border_1().border_color(t.border)
          .on_click((_event, context) => cycleMode(this, context))
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
          (context) => setMode(this, "demo", context), true))))
      .child(h_flex().id("agent-ui-main").flex_1().min_h(0)
        .relative().overflow_hidden()
        .on_scroll_wheel((event, context) => scrollWheel(this, event, context))
        .on_mouse_move((event, context) => railDragMove(this, event, context))
        .on_mouse_up("left", (_event, context) => railRelease(this, context))
        .on_hover((hovered, context) => {
          if (!hovered && this.railGesture) cancelRailGesture(this, context);
        })
        .child(div().id("agent-ui-viewport").flex_1().min_w(0).h_full()
          .relative().overflow_hidden()
          .on_size_change((size, context) => measureViewport(this, size, context))
          .when(this.turns.length > 0, (el) => el.child(v_flex().id("agent-ui-transcript")
            .absolute().left(0).right(0).top(-this.scrollY)
            .px(compact ? 13 : 23).py(18).gap(19)
            .children(this.turns.map((item) => turn(this, t, item)))))
          .when(this.turns.length === 0, (el) => el.child(emptyState(this, t)))
          .when(this.turns.length > 0 && this.viewportHeight >= 80, (el) => el.child(
            window.paint_path(FADE_RECT, Background.linear_gradient(180,
              `${fadeBase}00`, `${fadeBase}88`))
              .id("agent-ui-bottom-fade").absolute().bottom(0).left(0).right(0).h(54))))
        .when(railEnabled, (el) =>
          el.child(navigationStrip(this, t, geometry, visible, true)))
        .when(railEnabled && Boolean(this.hoveredTurn ?? this.keyTurn),
          (el) => el.child(hoverPreview(this, t, geometry)))
        .when(listEnabled && this.turnList, (el) => el.child(turnListPanel(this, t,
          railLayout(geometry.ranges, this.viewportHeight, [...visible]))))
        .when(this.newTurns > 0 || this.live > 0, (el) => el.child(h_flex().id("agent-ui-new-turns")
          .absolute().bottom(10).left(0).right(0).justify_center()
          .child(h_flex().id("agent-ui-new-turns-pill").h(24).px(10).gap(6)
            .items_center().rounded(12).bg(t.accent).cursor_pointer()
            .on_click((_event, context) => jumpToBottom(this, context))
            .child(icon("arrow-down", 10).text_color(t.background))
            .child(div().text_size(10.5).text_color(t.background)
              .child(this.live > 0 ? "live" : `${this.newTurns} new`))))))
      .child(this.asking !== null
        ? askPanel(this, t, compact)
        : composerArea(this, t, compact));
  }

  // Questions and ordinary drafts share one rounded composer shell. Only real
  // actions appear here: no attachment, voice or model controls without a host API.

  // Two weights, the same shape as the rest of the view: a flat pill for a
  // secondary action, a filled one for the action that finishes the prompt.

  // A click is the answer. For one single-choice question it goes out at once; a
  // multi-select or a batch collects first, because those have more than one step
  // and guessing when the user is done would be worse than a Send button.

  // The bridge owns delivery: this only writes the file, and the plugin that asked
  // resolves its own await with it. Optimistic close, because a banner that lingers
  // would look like a failed click.

  // The rows the cursor can land on, in render order: an option, then the freeform
  // row, question by question. Keys and clicks both resolve through this, so the
  // pointer on screen is always the row the keys would act on.

}
