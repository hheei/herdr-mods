// @ts-check
// Turn rendering: one Status line, one tool group, one turn.
// Every function here takes the view as `self`, so the state stays one object.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { exec } from "herdr";
import { formatUsage, summarizeActivity, turnUsage } from "./model.js";
import { DETAIL_CHARS, DETAIL_LINES, STATUSES, icon, markdown, toolLabel } from "./ui.js";
import { measureTurn, toggleGroup, toggleTool } from "./scroll.js";

export function statusLine(self, t, status) {
  const [label, token] = STATUSES[status] ?? ["Unknown", "dim"];
  const color = t[token] ?? t.muted;
  return h_flex().gap(6).items_center().text_color(color).text_size(11)
    .child(div().size(6).rounded(3).bg(color))
    .child(label);
}

export function toolDetail(self, t, tool) {
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

export function toolRow(self, t, tool) {
  const expanded = self.toolOpen.has(tool.id);
  const color = tool.status === "failed" ? t.blocked
    : tool.status === "pending" || tool.status === "running" ? t.working : t.muted;
  const status = tool.status === "failed" ? "Failed"
    : tool.status === "pending" ? "Pending"
    : tool.status === "running" ? "Working" : "Done";
  return v_flex().id(`agent-ui-tool-${tool.id}`).w_full().gap(5)
    .child(h_flex().id(`agent-ui-tool-trigger-${tool.id}`).h(29).w_full().gap(9)
      .items_center().cursor_pointer()
      .on_click((_event, cx) => toggleTool(self, tool.id, cx))
      .child(h_flex().w(10).flex_none().items_center().text_color(color)
        .child(tool.status === "done" ? icon("check", 11)
          : div().text_size(11).child(tool.status === "failed" ? "!" : "·")))
      .child(div().w(41).flex_none().text_size(11).text_color(t.dim).child(toolLabel(tool)))
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.foreground)
        .child(tool.target || tool.title))
      .child(div().text_size(10.5).text_color(color).child(status))
      .child(h_flex().w(10).flex_none().items_center().text_color(t.dim)
        .child(icon(expanded ? "chevron-down" : "chevron-right", 11))))
    .when(expanded, (el) => el.child(toolDetail(self, t, tool)));
}

export function activity(self, t, turn) {
  const data = summarizeActivity(turn.tools);
  const open = self.groupOpen.has(turn.id);
  // Failures remain available after expanding the list; they are not the
  // same thing as requests for user input and do not drive rail color.
  const summary = data.failed ? `${data.label} · ${data.failed} failed` : data.label;
  return v_flex().id(`agent-ui-activity-${turn.id}`).w_full().gap(7)
    .child(h_flex().id(`agent-ui-group-trigger-${turn.id}`).h(29)
      .w_full().gap(9).items_center().cursor_pointer()
      .on_click((_event, cx) => toggleGroup(self, turn.id, cx))
      .child(h_flex().w(12).flex_none().items_center().text_color(t.dim)
        .child(icon(open ? "chevron-down" : "chevron-right", 11)))
      .child(div().flex_1().min_w(0).truncate().text_size(11.5)
        .text_color(t.muted).child(summary)))
    .when(open, (el) => el.child(v_flex().id(`agent-ui-group-list-${turn.id}`)
      .w_full().pl(16).gap(3)
      .children(turn.tools.slice(0, 20).map((tool) => toolRow(self, t, tool)))
      .when(turn.tools.length > 20, (list) => list.child(
        div().text_size(11).text_color(t.dim)
          .child(`Showing first 20 / ${turn.tools.length} · demo limit`)))));
}

export function userMessage(self, t, turn) {
  return v_flex().id(`agent-ui-user-${turn.id}`).w_full().gap(6)
    .px(12).py(11).rounded(9).bg(t.raised)
    .border_1().border_color(t.border)
    .child(div().text_size(10.5).font_semibold().text_color(t.dim).child("You"))
    .child(markdown(t, `agent-ui-prompt-${turn.id}`, turn.prompt));
}

export function turn(self, t, turn) {
  if (turn.kind === "marker") {
    return h_flex().id(`agent-ui-turn-${turn.id}`).w_full().items_center().gap(9)
      .on_size_change((size, cx) => measureTurn(self, turn.id, size, cx))
      .child(div().flex_1().h(1).bg(t.border))
      .child(div().text_size(10).text_color(t.dim).child(turn.prompt))
      .child(div().flex_1().h(1).bg(t.border));
  }
  const usage = formatUsage(turnUsage(turn));
  return v_flex().id(`agent-ui-turn-${turn.id}`).w_full().gap(13)
    .on_size_change((size, cx) => measureTurn(self, turn.id, size, cx))
    .child(userMessage(self, t, turn))
    .child(v_flex().w_full().gap(9).px(4)
      .child(h_flex().items_center().gap(8)
        .child(div().text_size(10.5).font_semibold().text_color(t.accent).child("Pi"))
        .when(usage !== "", (el) => el.child(div().id(`agent-ui-usage-${turn.id}`)
          .text_size(10).text_color(t.dim).child(usage))))
      .children(turn.messages.map((message) =>
        markdown(t, `agent-ui-message-${message.id}`, message.text)))
      .when(turn.tools.length > 0, (el) => el.child(activity(self, t, turn))))
    .child(div().w_full().h(1).bg(t.border));
}
