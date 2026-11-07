// @ts-check
// The composer slot: a prompt box, and the ask-user card that takes its place.
// Every function here takes the view as `self`, so the state stays one object.
import { div } from "gpui-kit";
import { Textarea, h_flex, v_flex } from "gpui-base";
import { notify, writeTextFile } from "herdr";
import { control, icon } from "./ui.js";

export function pill(self, t, id, label, onClick, enabled, primary) {
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

export function composerArea(self, t, compact) {
  const draft = String(self.composer.value() ?? "").trim();
  return v_flex().id("agent-ui-composer-wrap").flex_none().px(compact ? 10 : 20).pt(10).pb(14)
    .child(v_flex().id("agent-ui-composer").w_full().p(compact ? 12 : 16).gap(10)
      .rounded(18).border_1().border_color(t.border).bg(t.background).shadow_sm()
      .child(Textarea.new(self.composer).id("agent-ui-textarea").w_full()
        .h(compact ? 66 : 84).p(4).bg(t.background)
        .text_color(t.foreground).text_size(13.5))
      .child(h_flex().items_center().gap(9)
        .child(div().flex_1().text_size(10.5).text_color(t.dim)
          .child(self.notice || (self.demo === "demo"
            ? "Synthetic data · no live Pi connection"
            : "Read-only in this state · the draft is kept")))
        .when(self.width >= 520 && self.demo === "demo", (el) => el.child(control(t,
          "agent-ui-stream", h_flex().gap(5).items_center()
            .child(icon(self.source.streaming() ? "square" : "play", 11))
            .child(div().child(self.source.streaming() ? "finish" : "stream")),
          (context) => {
            if (self.source.streaming()) self.source.finish();
            else self.source.replay();
            self.pump(context);
          }, true)))
        .child(pill(self, t, "agent-ui-send", "Try send · demo",
          (context) => self.send(context), Boolean(draft) && self.demo === "demo", true))));
}

export function askPanel(self, t, compact) {
  const asked = self.asking.questions ?? [];
  const one = asked.length === 1 ? asked[0] : null;
  const picks = (index) => self.askPicks[index] ?? [];
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
        .cursor_pointer().on_click((_event, context) => cancelAsk(self, context))
        .child(icon("x", 15).text_color(t.dim)))));
    if (question.context)
      rows.push(div().id(`agent-ui-ask-context-${index}`).pl(multi ? 33 : 0).pb(7).text_size(11.5)
        .text_color(t.dim).child(question.context));
    const list = [];
    for (const [slot, option] of (question.options ?? []).entries()) {
      const on = picks(index).includes(option.title);
      const at = flat++;
      const focus = self.askCursor === at;
      list.push(h_flex().id(`agent-ui-ask-${index}-${slot}`)
        .min_h(option.description ? (compact ? 76 : 68) : 47).px(12).gap(12)
        .items_center().rounded(11).cursor_pointer()
        .when(focus || on || self.askHover === at, (el) => el.bg(t.raised))
        .on_hover((hovered, context) => {
          const next = hovered ? at : -1;
          if (self.askHover !== next) { self.askHover = next; context.notify(); }
        })
        .on_click((_event, context) => pickAnswer(self, index, option.title, context))
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
      const focus = self.askCursor === flat++;
      list.push(self.askTyping === index
        ? Textarea.new(self.answer).id(`agent-ui-ask-input-${index}`).w_full()
          .h(compact ? 46 : 52).p(8).rounded(6).border_1().border_color(t.input)
          .bg(t.chrome).text_color(t.foreground).text_size(12)
        : h_flex().id(`agent-ui-ask-free-${index}`).h(44).px(12).gap(11).items_center()
          .rounded(10).cursor_pointer()
          .when(focus, (el) => el.bg(t.raised))
          .on_click((_event, context) => typeAnswer(self, index, context))
          .child(icon("pencil", 14).text_color(t.dim))
          .child(div().text_size(12.5).text_color(t.dim)
            .child("Type your own answer")));
    }
    if (list.length) rows.push(...list);
  }

  const instant = Boolean(one) && !one.allowMultiple;
  const typed = one?.allowFreeform ? String(self.answer.value() ?? "").trim() : "";
  const ready = asked.length > 0 && asked.every((question, index) =>
    picks(index).length > 0 || (index === 0 && typed !== "")
      || (self.askTyping === index && String(self.answer.value() ?? "").trim() !== ""));
  return v_flex().id("agent-ui-composer-wrap").flex_none().px(compact ? 10 : 20).pt(10).pb(14)
    .child(v_flex().id("agent-ui-composer").w_full().p(compact ? 12 : 16).gap(12)
      .rounded(18).border_1().border_color(t.border).bg(t.background).shadow_sm()
      .child(v_flex().id("agent-ui-ask").w_full().flex_none().gap(4).children(rows))
      .child(one?.allowFreeform
        ? h_flex().id("agent-ui-ask-free-0").h(43).items_center().gap(9)
          .child(icon("pencil", 14).text_color(t.dim))
          .child(Textarea.new(self.answer).id("agent-ui-ask-input-0")
            .flex_1().min_w(0).h(40).p(6).bg(t.background)
            .text_color(t.foreground).text_size(12.5))
          .child(pill(self, t, "agent-ui-ask-send", ready ? "Send" : "Skip",
            (context) => ready ? sendAnswer(self, context) : cancelAsk(self, context), true, ready))
        : h_flex().items_center().gap(9)
          .child(div().flex_1().text_size(10.5).text_color(t.dim)
            .child(self.asking.heading && asked.length > 1 ? self.asking.heading
              : instant ? "Choose an option · Esc to dismiss"
              : one?.allowMultiple ? "Pick any · then send" : "Answer each one · then send"))
          .when(!instant, (el) => el.child(pill(self, t, "agent-ui-ask-send", "Send",
            (context) => sendAnswer(self, context), ready, true)))));
}

export function pickAnswer(self, index, title, cx) {
  const question = (self.asking?.questions ?? [])[index];
  if (!question) return;
  if ((self.asking.questions ?? []).length === 1 && !question.allowMultiple) {
    postAnswer(self, { response: { kind: "selection", selections: [title] } }, cx);
    return;
  }
  const picks = self.askPicks[index] ?? [];
  self.askPicks[index] = question.allowMultiple
    ? (picks.includes(title) ? picks.filter((item) => item !== title) : [...picks, title])
    : [title];
  cx.notify();
}

export function sendAnswer(self, cx) {
  const asked = self.asking?.questions ?? [];
  const answers = [];
  for (const [index, question] of asked.entries()) {
    const picks = self.askPicks[index] ?? [];
    const typed = (asked.length === 1 && question.allowFreeform) || self.askTyping === index
      ? String(self.answer.value() ?? "").trim() : "";
    if (!picks.length && !typed) return;
    answers.push({ status: "answered",
      response: typed ? { kind: "freeform", text: typed }
        : { kind: "selection", selections: picks } });
  }
  if (!answers.length) return;
  // A batch is answered as a whole, which is the shape the plugin's own batch
  // surface returns; a single question is just its response.
  postAnswer(self, { response: asked.length > 1 ? answers : answers[0].response }, cx);
}

export function cancelAsk(self, cx) {
  postAnswer(self, { cancel: true }, cx);
}

export function postAnswer(self, payload, cx) {
  const dir = self.bridge?.dir;
  self.asking = null;
  self.askPicks = {};
  self.askTyping = -1;
  self.askCursor = 0;
  self.askHover = -1;
  self.answer.set_value("");
  cx.notify();
  if (!dir) return;
  cx.spawn(async () => {
    await writeTextFile(`${dir}/answer.json`, JSON.stringify(payload), null);
  });
}

export function askTargets(self) {
  const targets = [];
  for (const [index, question] of (self.asking?.questions ?? []).entries()) {
    for (const option of question.options ?? []) targets.push({ index, title: option.title });
    if (question.allowFreeform) targets.push({ index, freeform: true });
  }
  return targets;
}

export function askKey(self, key, cx) {
  if (key === "escape") {
    cancelAsk(self, cx);
    return;
  }
  const targets = askTargets(self, );
  if (!targets.length) return;
  const at = Math.min(Math.max(self.askCursor, 0), targets.length - 1);
  const asked = self.asking?.questions ?? [];
  const digit = Number.parseInt(key, 10);
  if (Number.isInteger(digit) && digit >= 1) {
    if (!targets[digit - 1]) return;
    self.askCursor = digit - 1;
    choose(self, targets[digit - 1], cx);
    return;
  }
  if (key === "up" || key === "down") {
    self.askCursor = (at + (key === "up" ? targets.length - 1 : 1)) % targets.length;
    cx.notify();
    return;
  }
  if (key === " " || key === "space") {
    choose(self, targets[at], cx);
    return;
  }
  if (key !== "enter" && key !== "return") return;
  // Enter commits: a tick list needs it because ticking is not answering.
  if (asked.length > 1 || asked.some((question) => question.allowMultiple))
    sendAnswer(self, cx);
  else choose(self, targets[at], cx);
}

export function choose(self, target, cx) {
  if (target.freeform) typeAnswer(self, target.index, cx);
  else pickAnswer(self, target.index, target.title, cx);
}

export function typeAnswer(self, index, cx) {
  self.askTyping = index;
  self.askCursor = askTargets(self, ).findIndex((target) => target.freeform && target.index === index);
  cx.notify();
}
