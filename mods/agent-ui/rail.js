// @ts-check
// The Message Rail and the narrow-pane list that replaces it.
// Every function here takes the view as `self`, so the state stays one object.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { notify } from "herdr";
import { previewTop, railLayout, shortPrompt, toRailNodes, visibleTurnIds } from "./model.js";
import { control } from "./ui.js";
import { railMove, railPress, railRelease, selectTurn, setMode } from "./scroll.js";

export function navigationStrip(self, t, geometry, visible, showPins) {
  const layout = railLayout(geometry.ranges, self.viewportHeight, [...visible]);
  return div().id("agent-ui-rail").w(18).flex_none().h_full()
    .relative().overflow_hidden().cursor_pointer()
    .on_mouse_down("left", (event, cx) => railPress(self, event, cx))
    .on_mouse_move((event, cx) => railMove(self, event, cx))
    .on_mouse_up("left", (_event, cx) => railRelease(self, cx))
    .on_hover((hovered, cx) => {
      if (!hovered && self.hoveredTurn !== null) {
        self.hoveredTurn = null;
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
          .when(self.keyTurn && dot.turnIds.includes(self.keyTurn),
            (el) => el.opacity(1).bg(t.accent))
          .when(!(self.keyTurn && dot.turnIds.includes(self.keyTurn)),
            (el) => el.opacity(0.7).bg(dot.visible ? t.muted : t.dim))))));
}

export function hoverPreview(self, t, geometry) {
  const target = self.hoveredTurn ?? self.keyTurn;
  if (!target) return null;
  const nodes = toRailNodes(self.turns);
  const node = nodes.find((item) => item.id === target);
  if (!node || self.width < 240) return null;
  if (self.viewportHeight < (node.actionable ? 60 : 44)) return null;
  const layout = railLayout(geometry.ranges, self.viewportHeight,
    visibleTurnIds(geometry.ranges, self.scrollY, self.viewportHeight));
  const dot = layout.dots.find((item) => item.turnIds.includes(target));
  if (!dot) return null;
  const grouped = dot.turnIds.length > 1 ? ` +${dot.turnIds.length - 1}` : "";
  return v_flex().id("agent-ui-rail-preview").absolute().right(22)
    // Keep preview wholly inside the conversation viewport, even for the
    // first/last marker. The containing main area clips excess pixels.
    .top(previewTop(dot.center - layout.pitch / 2, self.viewportHeight, node.actionable))
    .w(Math.min(207, self.width - 30)).px(11).py(9).gap(5)
    .rounded(7).bg(t.popover).border_1().border_color(t.border)
    .child(div().text_size(11.5).text_color(t.foreground)
      .truncate().child(shortPrompt(node.preview, 39) + grouped))
    .when(node.actionable, (el) => el.child(
      div().text_size(10.5).text_color(t.blocked).child("! Needs you")));
}

export function emptyState(self, t) {
  return v_flex().id("agent-ui-empty").size_full().items_center().justify_center()
    .gap(7).px(18)
    .child(div().text_size(13).text_color(t.muted).child("No turns yet"))
    .child(div().text_size(11).text_color(t.dim)
      .child("Nothing has arrived from the bridge, so there is no transcript to show."))
    .child(control(t, "agent-ui-empty-restore", "Restore demo turns",
      (context) => setMode(self, "demo", context), true));
}

export function turnListPanel(self, t, layout) {
  const rows = Math.max(3, Math.floor((self.viewportHeight - 120) / 26));
  const nodes = toRailNodes(self.turns);
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
          self.turnList = false;
          selectTurn(self, dot.id, cx);
        })
        .child(div().flex_1().min_w(0).truncate().text_size(11.5)
          .text_color(t.foreground).child(shortPrompt(node?.preview ?? "", 32) + grouped));
    }))
    .when(layout.dots.length > rows, (el) => el.child(
      div().text_size(10.5).text_color(t.dim)
        .child(`+${layout.dots.length - rows} more turns · open a wider pane`)));
}
