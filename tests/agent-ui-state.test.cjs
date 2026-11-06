// The reducer is host-free: no fake builder, no cx, no timers.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

const box = {};
vm.runInNewContext(
  fs.readFileSync(path.join(root, "mods/agent-ui/state.js"), "utf8").replace(/^export /gm, "")
  + "\nthis.createTranscript=createTranscript;this.applyEvent=applyEvent;this.deriveStatus=deriveStatus;",
  box,
);

const turn = (event) => box.applyEvent(event.state, event.event);

let state = box.createTranscript([{ id: "t1", prompt: "hi", status: "done", messages: [], tools: [] }]);
assert.equal(state.turns[0].prompt, "hi");
assert.equal(box.deriveStatus({ messages: [], tools: [] }), "done");
assert.equal(box.deriveStatus({ requiresUserAction: true, messages: [], tools: [] }), "needs-input");
assert.equal(box.deriveStatus({ tools: [{ status: "running" }] }), "working");
assert.equal(box.deriveStatus({ messages: [{ open: true }] }), "working");

// A turn opens, streams, and closes into a finished turn.
let result = box.applyEvent(state, { type: "turn.start", turn: { id: "t2", prompt: "why" } });
assert.equal(result.changed, true);
assert.equal(result.grew, true);
state = result.state;
assert.equal(state.turns.length, 2);
assert.equal(state.turns[1].status, "working");
assert.equal(turn({ state, event: { type: "turn.start", turn: { id: "t2" } } }).changed, false,
  "the same turn is not opened twice");

result = box.applyEvent(state, { type: "message.start", turnId: "t2", message: { id: "a1" } });
state = result.state;
result = box.applyEvent(state, { type: "message.delta", turnId: "t2", messageId: "a1", text: "because " });
state = result.state;
assert.equal(state.turns[1].messages[0].text, "because ");
result = box.applyEvent(state, { type: "message.delta", turnId: "t2", messageId: "a1", text: "jitter" });
state = result.state;
assert.equal(state.turns[1].messages[0].text, "because jitter");
result = box.applyEvent(state, { type: "message.delta", turnId: "t2", messageId: "missing", text: "x" });
assert.equal(result.changed, false, "a delta for an unknown message is dropped");
result = box.applyEvent(state, { type: "message.end", turnId: "t2", messageId: "a1" });
state = result.state;
assert.equal(state.turns[1].messages[0].open, false);
assert.equal(state.turns[1].status, "done");

// Tools keep a turn working until they finish.
result = box.applyEvent(state, { type: "tool.start", turnId: "t2",
  tool: { id: "tool1", kind: "exec", status: "running" } });
state = result.state;
assert.equal(state.turns[1].status, "working");
result = box.applyEvent(state, { type: "tool.update", turnId: "t2", toolId: "tool1",
  patch: { status: "failed", detail: "exit 1" } });
state = result.state;
assert.equal(state.turns[1].status, "done", "a failed tool is not user attention");
assert.equal(state.turns[1].tools[0].detail, "exit 1");
result = box.applyEvent(state, { type: "turn.action", turnId: "t2", required: true });
state = result.state;
assert.equal(state.turns[1].status, "needs-input");
result = box.applyEvent(state, { type: "turn.action", turnId: "t2", required: false });
state = result.state;
assert.equal(state.turns[1].status, "done");

// A reconnect may deliver the same event twice, and may drop a turn we had.
const duplicated = { id: "ev-9", type: "message.delta", turnId: "t2", messageId: "a1", text: "!" };
state = box.applyEvent(state, duplicated).state;
const textOnce = state.turns[1].messages[0].text;
assert.equal(box.applyEvent(state, duplicated).changed, false, "the same event id is applied once");
result = box.applyEvent(state, { type: "message.delta", turnId: "gone", messageId: "a1", text: "x" });
assert.equal(result.changed, false, "a delta for a dropped turn is ignored, not guessed");
assert.equal(box.applyEvent(state, { type: "nonsense" }).changed, false);

// Immutability: the old state is not retroactively edited.
assert.equal(state.turns[1].messages[0].text, textOnce);
const before = state;
const beforeStatus = before.turns[1].status;
state = box.applyEvent(before, { type: "turn.end", turnId: "t2", status: "failed" }).state;
assert.equal(state.turns[1].status, "failed", "an explicit end status wins");
assert.equal(before.turns[1].status, beforeStatus, "the previous state is untouched");
state = box.applyEvent(state, { type: "turn.end", turnId: "t2" }).state;
assert.equal(state.turns[1].status, "done", "a bare end falls back to derived status");

// A snapshot replaces everything, which is what a reconnect starts from.
const fresh = box.applyEvent(state, { type: "snapshot", turns: [{ id: "n1", prompt: "new" }] }).state;
assert.equal(fresh.turns.length, 1);
assert.equal(fresh.turns[0].id, "n1");
assert.notEqual(fresh.turns, state.turns, "the snapshot array is ours, not the caller's");

console.log("PASS: reducer — open/stream/close, tools, action, dedupe, dropped turns, immutability, snapshot.");
