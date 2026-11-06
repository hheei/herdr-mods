// Pi Agent UI P0: fixture-driven native GPUI prototype.
// NO process, Core terminal, Pi session, disk transcript or network operations.
import { View, div } from "gpui-kit";
import { h_flex, v_flex, InputState, Input, TextareaState, Textarea } from "gpui-base";
import { theme, props } from "herdr";
import { CASES } from "./fixtures.js";

const STATUS_TEXT = { working: "Working", done: "Completed", blocked: "Needs attention" };
const STATUS_COLOR = { working: "working", done: "done", blocked: "blocked" };

function button(t, id, title, onClick, selected = false, enabled = true) {
  return h_flex().id(id).h(29).px(12).rounded(7).items_center().flex_none()
    .bg(selected ? t.selected : t.raised)
    .border_1().border_color(selected ? t.accent : t.border)
    .text_color(enabled ? t.foreground : t.dim).text_size(12.5)
    .cursor_pointer()
    .on_click((_e, cx) => { if (enabled) onClick(cx); })
    .child(title);
}

function para(t, id, content) {
  const value = String(content ?? "");
  return v_flex().id(id).gap(6)
    .children(value.split("\n\n").map((part, i) => {
      const heading = part.startsWith("## ");
      return div().id(`${id}-p${i}`).text_size(heading ? 15.5 : 13.5)
        .when(heading, (el) => el.font_semibold())
        .text_color(t.foreground)
        .child(heading ? part.slice(3) : part);
    }));
}

export default class AgentUi extends View {
  init(_ignored, cx) {
    const initial = props()?.scenario;
    this.scene = CASES.some((c) => c.id === initial) ? initial : "working";
    this.expanded = new Set();
    this.extra = [];
    this.filter = InputState.new({ placeholder: "Search this preview…" });
    this.filter.on("change", (_e, context) => context.notify());
    this.composer = TextareaState.new({
      value: "",
      placeholder: "Write a message (preview only; nothing is sent to Pi)",
      rows: 3,
    });
    this.composer.on("change", (_e, context) => context.notify());
    this.note = "";
    this.width = 760;
  }

  active() { return CASES.find((c) => c.id === this.scene) ?? CASES[0]; }

  select(id, cx) {
    if (!CASES.some((x) => x.id === id) || this.scene === id) return;
    this.scene = id;
    this.expanded.clear();
    this.extra = [];
    this.note = "";
    cx.notify();
  }

  toggle(id, cx) {
    if (this.expanded.has(id)) this.expanded.delete(id);
    else this.expanded.add(id);
    cx.notify();
  }

  // A LOCAL mock interaction; never invokes a Pi, shell, Core command or API.
  send(cx) {
    const draft = String(this.composer.value() ?? "").trim();
    if (!draft) return;
    const id = `local-${this.extra.length}`;
    this.extra.push({ id, role: "user", text: draft });
    this.extra.push({
      id: `${id}-reply`, role: "assistant",
      text: "Mock only: this message was displayed locally in the prototype. Nothing was sent to Pi.",
    });
    this.note = "Local preview only · no message was sent";
    this.composer.set_value("");
    cx.notify();
  }

  // Screen-size responsive, but never dynamically changes the host Pane tree.
  sizeChanged(size, cx) {
    const width = Math.max(320, Math.round(size?.width ?? 760));
    if (Math.abs(width - this.width) >= 16) { this.width = width; cx.notify(); }
  }

  status(t, scene) {
    const color = t[STATUS_COLOR[scene.status]] ?? t.muted;
    return h_flex().gap(7).items_center().text_size(11.5).text_color(color)
      .child(div().size(6).rounded(4).bg(color))
      .child(STATUS_TEXT[scene.status] ?? "Unknown");
  }

  toolRow(t, tool) {
    const isOpen = this.expanded.has(tool.id);
    const isBad = tool.status === "failed";
    const color = isBad ? t.blocked : tool.status === "running" ? t.working : t.muted;
    return v_flex().id(`tool-${tool.id}`).w_full().gap(0).rounded(8)
      .border_1().border_color(isBad ? t.blocked : t.border)
      .bg(t.raised)
      .child(h_flex().id(`tool-toggle-${tool.id}`).gap(10).p(11).items_center()
        .cursor_pointer().on_click((_e, cx) => this.toggle(tool.id, cx))
        .child(div().w(14).text_color(t.dim).child(isOpen ? "⌄" : "›"))
        .child(v_flex().min_w(0).flex_1().gap(3)
          .child(div().text_size(12.5).font_medium().text_color(t.foreground).child(tool.title))
          .child(div().text_size(11).text_color(t.dim).truncate().child(tool.subtitle)))
        .child(div().text_size(11).text_color(color)
          .child(isBad ? "Failed" : tool.status === "running" ? "Running" : "Done")))
      .when(isOpen, (el) => el.child(v_flex().id(`tool-detail-${tool.id}`)
        .px(14).pb(12).pt(4).border_t(1).border_color(t.border)
        .child(div().text_size(11.5).text_color(t.muted).child(tool.detail))));
  }

  row(t, row) {
    if (row.role === "tools") {
      const visible = row.items.filter((tool) => {
        const query = this.filter.value().trim().toLowerCase();
        return !query || `${tool.title} ${tool.subtitle} ${tool.detail}`.toLowerCase().includes(query);
      });
      if (!visible.length) return null;
      return v_flex().id(row.id).w_full().gap(8)
        .child(h_flex().gap(8).items_center()
          .child(div().text_size(11).font_semibold().text_color(t.dim).child(row.label))
          .child(div().text_size(11).text_color(t.dim).child(`${visible.length} tools`)))
        .children(visible.map((item) => this.toolRow(t, item)));
    }

    const role = row.role === "user" ? "You" : "Pi";
    return v_flex().id(row.id).w_full().gap(8).px(14).py(13).rounded(10)
      .bg(row.role === "user" ? t.raised : t.background)
      .when(row.role === "user", (el) => el.border_1().border_color(t.border))
      .child(div().text_size(11).font_semibold()
        .text_color(row.role === "user" ? t.foreground : t.accent).child(role))
      .child(para(t, `${row.id}-body`, row.text));
  }

  render(cx) {
    const t = theme();
    const scene = this.active();
    const compact = this.width < 520;
    const query = String(this.filter.value() ?? "").trim().toLowerCase();
    const rows = [...scene.rows, ...this.extra].filter((row) => !query
      || row.role === "tools"
      || `${row.text ?? ""} ${row.role ?? ""}`.toLowerCase().includes(query));
    const nodes = rows.map((row) => this.row(t, row)).filter(Boolean);
    const draft = String(this.composer.value() ?? "").trim();

    return v_flex().id("agent-ui-root").size_full().min_h(0).bg(t.background)
      .text_color(t.foreground)
      .on_size_change((size, context) => this.sizeChanged(size, context))
      .child(h_flex().id("agent-ui-header").h(49).flex_none().px(18).gap(10)
        .items_center().border_b(1).border_color(t.border)
        .child(v_flex().gap(2).flex_1().min_w(0)
          .child(div().text_size(14).font_semibold().child("Pi · Agent UI"))
          .child(div().text_size(11).text_color(t.dim).truncate().child(scene.subtitle)))
        .child(this.status(t, scene))
        .child(div().text_size(10).text_color(t.dim).child("P0 · DEMO")))
      .child(h_flex().id("agent-ui-scenes").flex_none().px(18).py(10).gap(6).items_center()
        .children(CASES.map((c) => button(t, `scenario-${c.id}`, c.label,
          (context) => this.select(c.id, context), this.scene === c.id))))
      .child(v_flex().id("agent-ui-scroll").flex_1().min_h(0)
        .overflow_y_scrollbar().px(compact ? 13 : 24).py(12).gap(14)
        .child(h_flex().items_center().gap(8).w_full()
          .child(div().flex_1().text_size(11).text_color(t.dim)
            .child("Synthetic conversation · no live Pi connection"))
          .when(!compact, (el) => el.child(div().text_size(11).text_color(t.dim).child("Read-only source: fixtures"))))
        .child(Input.new(this.filter).id("agent-ui-search").h(35).w_full().px(10)
          .rounded(7).border_1().border_color(t.border).bg(t.raised)
          .text_color(t.foreground).text_size(12))
        .when(nodes.length === 0, (el) => el.child(div().py(24).text_color(t.muted)
          .text_size(13).child("No matching preview content.")))
        .children(nodes))
      .child(v_flex().id("agent-ui-composer").flex_none().px(compact ? 12 : 22)
        .pt(12).pb(14).gap(8).border_t(1).border_color(t.border).bg(t.chrome)
        .child(div().text_size(11).text_color(t.muted)
          .child("Local composer preview · never sends to Pi"))
        .child(Textarea.new(this.composer).id("agent-ui-textarea").h(compact ? 75 : 82)
          .w_full().p(10).rounded(8).border_1().border_color(t.input)
          .bg(t.background).text_color(t.foreground).text_size(13))
        .child(h_flex().items_center().gap(10)
          .child(div().flex_1().text_size(11).text_color(t.dim)
            .child(this.note || "Try composing a message; it stays in this demo."))
          .child(button(t, "agent-ui-send", compact ? "Try" : "Try send (demo)",
            (context) => this.send(context), false, Boolean(draft)))));
  }
}
