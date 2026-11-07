// @ts-check
// The pieces every part of the view draws with: one SVG icon, one text control,
// one Markdown block, one tool label. Kept here so `main.js` stays the class.
import { div, svg, PathBuilder } from "gpui-kit";
import { h_flex, v_flex, TextView } from "gpui-base";

export const STATUSES = {
  working: ["Working", "working"],
  done: ["Completed", "muted"],
  "needs-input": ["Needs attention", "blocked"],
};

// Herdr's own mods ship Lucide outline icons and tint them with text_color; a
// glyph from a Nerd Font instead depends on the reader having that font.
export function icon(name, size) {
  return svg(`mods/agent-ui/icons/${name}.svg`).size(size).flex_none();
}

export function control(t, id, title, onClick, enabled = true) {
  return h_flex().id(id).h(29).px(11).flex_none().items_center()
    .rounded(7).border_1().border_color(t.border)
    .bg(t.raised).text_size(11.5)
    .text_color(enabled ? t.foreground : t.dim)
    .when(enabled, (el) => el.cursor_pointer().on_click((_event, cx) => onClick(cx)))
    .child(title);
}

export function markdown(t, id, source) {
  // Official Herdr Mod guide: TextView.markdown(id, text). Not a home-grown parser.
  return v_flex().id(id).w_full().min_w(0).text_size(13.5).text_color(t.foreground)
    .child(TextView.markdown(`${id}-md`, String(source ?? "")));
}

export function toolLabel(tool) {
  const names = { read: "Read", search: "Search", exec: "Run", edit: "Edit", custom: "Tool" };
  const kind = String(tool?.kind ?? "");
  // An unknown kind is shown as it is; never silently relabel it as a known tool.
  return names[kind] ?? (kind ? kind.toUpperCase() : "Tool");
}

export const DETAIL_LINES = 18;
export const DETAIL_CHARS = 4000;
export const FADE_RECT = PathBuilder.fill().move_to("0%", "0%")
  .line_to("100%", "0%").line_to("100%", "100%")
  .line_to("0%", "100%").close().build();
