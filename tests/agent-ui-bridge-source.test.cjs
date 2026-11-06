// The reader half: two state files in, reducer events out.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

async function load(file) {
  const src = fs.readFileSync(path.join(root, file), "utf8");
  return import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
}

const turn = (id, text, extra = {}) => ({
  id, prompt: `prompt ${id}`, status: "working",
  messages: [{ id: `a-${id}`, role: "assistant", text, open: true }], tools: [], ...extra,
});
const meta = (extra = {}) => ({ version: 2, epoch: "e1", revision: 1,
  sessionId: "s-1", cwd: "/tmp/p", updatedAt: "2026-01-01T00:00:00.000Z", ...extra });

(async () => {
  const source = await load("mods/agent-ui/bridge-source.js");
  const reducer = await load("mods/agent-ui/state.js");

  let state = source.initialBridge();
  let result = source.readBridge(state, { meta: null, done: null, live: null });
  assert.deepEqual(result.events, [], "a missing producer delivers nothing");
  assert.equal(result.health, "missing");

  result = source.readBridge(state, {
    meta: meta(), done: { version: 2, epoch: "e1", revision: 3, turns: [turn("t-1", "done", { status: "done" })] },
    live: { version: 2, epoch: "e1", revision: 4, turn: turn("t-2", "half") },
  });
  assert.equal(result.health, "live");
  assert.deepEqual(result.events.map((event) => event.type), ["snapshot", "turn.replace"],
    "a new epoch seeds history, then layers the turn in flight");
  state = result.state;

  result = source.readBridge(state, {
    meta: meta(), done: { version: 2, epoch: "e1", revision: 3, turns: [turn("t-1", "done", { status: "done" })] },
    live: { version: 2, epoch: "e1", revision: 4, turn: turn("t-2", "half") },
  });
  assert.deepEqual(result.events, [], "unchanged revisions cost nothing to repaint");

  result = source.readBridge(state, {
    meta: meta(), done: { version: 2, epoch: "e1", revision: 3, turns: [turn("t-1", "done", { status: "done" })] },
    live: { version: 2, epoch: "e1", revision: 5, turn: turn("t-2", "half a sentence") },
  });
  assert.deepEqual(result.events.map((event) => event.type), ["turn.replace"],
    "a throttled flush of the live turn is one replace, not a delta stream");
  state = result.state;

  result = source.readBridge(state, {
    meta: meta(), done: { version: 2, epoch: "e1", revision: 6,
      turns: [turn("t-1", "done", { status: "done" }), turn("t-2", "half a sentence more", { status: "done" })] },
    live: { version: 2, epoch: "e1", revision: 7, turn: null },
  });
  assert.deepEqual(result.events.map((event) => event.type), ["snapshot"],
    "a settled turn is already inside the snapshot; no second replace");
  state = result.state;

  const transcript = reducer.createTranscript([]);
  let applied = transcript;
  let grew = [];
  for (const event of result.events) {
    const next = reducer.applyEvent(applied, event);
    if (next.grew) grew.push(event.type);
    applied = next.state;
  }
  assert.deepEqual(Array.from(applied.turns, (item) => [item.id, item.status]),
    [["t-1", "done"], ["t-2", "done"]], "the reducer lands the same transcript");
  assert.deepEqual(grew, ["snapshot"], "only real growth nudges the scroll anchor");

  result = source.readBridge(state, {
    meta: meta({ closed: true }), done: null, live: null,
  });
  assert.equal(result.health, "closed", "a closed producer is not a stale one");
  assert.deepEqual(result.events, []);

  const rewritten = source.readBridge(state, {
    meta: meta({ epoch: "e2" }), done: { version: 2, epoch: "e2", revision: 1, turns: [turn("t-9", "new proc")] },
    live: { version: 2, epoch: "e2", revision: 2, turn: null },
  });
  assert.deepEqual(rewritten.events.map((event) => [event.type, event.turns?.[0]?.id ?? null]),
    [["snapshot", "t-9"]], "a restarted Pi replaces the transcript instead of appending to it");

  const calls = [];
  const fake = {
    initialDir: null,
    async find() {
      calls.push("find");
      return "/bridge/123";
    },
    async read(dir) {
      calls.push(dir);
      return { meta: meta(), done: { version: 2, epoch: "e1", revision: 1, turns: [] }, live: { version: 2, epoch: "e1", revision: 2, turn: turn("t-1", "hi") } };
    },
  };
  const bridge = source.createBridgeSource(fake);
  assert.equal(bridge.snapshot().length, 0, "a bridge starts empty and is filled by refresh");
  assert.equal(await bridge.refresh(), true);
  assert.deepEqual(calls, ["find", "/bridge/123"]);
  assert.equal(bridge.health, "live");
  assert.equal(bridge.dir, "/bridge/123");
  assert.equal(await bridge.refresh(), false, "a second read of the same revisions is quiet");
  assert.equal(bridge.take().type, "snapshot");
  assert.equal(bridge.take().type, "turn.replace");
  assert.equal(bridge.take(), null);
  assert.equal(bridge.step(), false, "a bridge has no clock of its own");

  const blind = source.createBridgeSource({ async find() { return null; }, async read() { throw new Error("unused"); } });
  assert.equal(await blind.refresh(), false);
  assert.equal(blind.health, "missing", "no producer is a state the UI can show");

  console.log("PASS: bridge reader — epoch reset, revision diff, settle, close, quiet refresh.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
