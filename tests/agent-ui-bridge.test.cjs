// The writer side of the bridge: Pi entries in, two state files out.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

async function load(file) {
  const src = fs.readFileSync(path.join(root, file), "utf8");
  const url = "data:text/javascript;base64," + Buffer.from(src).toString("base64");
  return import(url);
}

function messageEntry(id, message) {
  return { type: "message", id, parentId: null, timestamp: new Date(0).toISOString(), message };
}

(async () => {
  const bridge = await load("mods/agent-ui/bridge/herdr-agent-ui.js");
  const project = bridge;
  const mailbox = bridge;

  assert.equal(project.kindOf("bash"), "exec");
  assert.equal(project.kindOf("grep"), "search");
  assert.equal(project.kindOf("write"), "edit");
  assert.equal(project.kindOf("mystery"), "custom", "an unknown tool keeps its own kind");
  assert.equal(project.targetOf({ command: "npm test" }), "npm test");
  assert.equal(project.targetOf({ path: "a/b.ts" }), "a/b.ts");
  assert.equal(project.targetOf({ command: "x".repeat(200) }).length, 80);
  assert.equal(project.textOf({ content: [{ type: "text", text: "a" }, { type: "image" }] }), "a");
  assert.equal(project.textOf({ content: "plain" }), "plain");

  const entries = [
    messageEntry("u1", { role: "user", content: "why is retry slow?", timestamp: 0 }),
    messageEntry("a1", { role: "assistant", timestamp: 0, content: [
      { type: "text", text: "Let me look." },
      { type: "toolCall", id: "call-1", name: "read", arguments: { path: "src/retry.ts" } },
      { type: "toolCall", id: "call-2", name: "bash", arguments: { command: "npm test" } },
    ] }),
    messageEntry("r1", { role: "toolResult", toolCallId: "call-1", toolName: "read", isError: false,
      content: [{ type: "text", text: "export const retry = ..." }], timestamp: 0 }),
    messageEntry("r2", { role: "toolResult", toolCallId: "call-2", toolName: "bash", isError: true,
      content: [{ type: "text", text: "exit 1" }], timestamp: 0 }),
    { type: "custom", id: "c1", parentId: "r2", timestamp: new Date(0).toISOString(), customType: "note" },
    messageEntry("u2", { role: "user", content: [{ type: "text", text: "and the cap?" }], timestamp: 0 }),
  ];
  const turns = project.entriesToTurns(entries);
  assert.equal(turns.length, 2, "one turn per user message");
  assert.equal(turns[0].id, "u1");
  assert.equal(turns[0].prompt, "why is retry slow?");
  assert.equal(turns[0].messages.length, 1);
  assert.equal(turns[0].messages[0].text, "Let me look.");
  assert.equal(turns[0].messages[0].open, false);
  assert.deepEqual(Array.from(turns[0].tools, (tool) => [tool.id, tool.kind, tool.target, tool.status]),
    [["call-1", "read", "src/retry.ts", "done"], ["call-2", "exec", "npm test", "failed"]]);
  assert.equal(turns[0].tools[0].detail, "export const retry = ...");
  assert.equal(turns[1].prompt, "and the cap?");
  assert.equal(project.entriesToTurns([]).length, 0);
  assert.deepEqual(project.entriesToTurns([
    messageEntry("u3", { role: "user", content: "q", timestamp: 0 }),
    messageEntry("a3", { role: "assistant", timestamp: 0, content: [{ type: "text", text: "hi" }],
      usage: { input: 1, output: 2, cacheRead: 0, totalTokens: 3, cost: { total: 0.01 } } }),
  ])[0].messages[0].usage, { input: 1, output: 2, cacheRead: 0, total: 3, cost: 0.01 },
  "the projection carries usage through");

  const marker = project.entriesToTurns([
    messageEntry("u1", { role: "user", content: "before", timestamp: 0 }),
    { type: "compaction", id: "c1", parentId: "u1", timestamp: new Date(0).toISOString(),
      summary: "so far", firstKeptEntryId: "u1" },
    messageEntry("u2", { role: "user", content: "after", timestamp: 0 }),
  ]);
  assert.deepEqual(Array.from(marker, (turn) => [turn.kind ?? "turn", turn.prompt]),
    [["turn", "before"], ["marker", "Context compacted"], ["turn", "after"]],
    "a compaction boundary is shown, not swallowed");

  const usage = project.usageOf({ usage: { input: 10, output: 5, cacheRead: 100, totalTokens: 115,
    cost: { input: 0.001, output: 0.002, cacheRead: 0, cacheWrite: 0, total: 0.003 } } });
  assert.deepEqual({ ...usage }, { input: 10, output: 5, cacheRead: 100, total: 115, cost: 0.003 });
  assert.equal(project.usageOf({ role: "assistant" }), null, "no usage is null, not zeroes");
  const openQuestion = { id: "q-1", heading: "Pick one",
    questions: [{ index: 0, total: 1, question: "which db?", options: [{ title: "postgres" }],
      allowMultiple: false, allowFreeform: true }] };
  assert.deepEqual(project.askState(null, "pi-ask-user:question", openQuestion), {
    id: "q-1", heading: "Pick one", questions: openQuestion.questions },
    "the plugin announces the question, its options and an id");
  assert.equal(project.askState({ id: "q-1" }, "pi-ask-user:question", { id: "q-1", questions: null }),
    null, "and closes it with null questions");
  assert.deepEqual(project.askState({ id: "q-1" }, "pi-ask-user:blocked", { active: true }),
    { id: "q-1" }, "an unrelated channel cannot clear a question");

  assert.deepEqual(project.answerFor({ id: "q-1" },
    { id: "q-1", response: { kind: "selection", selections: ["postgres"] } }),
    { id: "q-1", response: { kind: "selection", selections: ["postgres"] } },
    "an answer for the open prompt is passed through");
  assert.equal(project.answerFor({ id: "q-1" }, { id: "q-0", response: { kind: "freeform", text: "x" } }),
    null, "a stale answer for a closed prompt is dropped");
  assert.equal(project.answerFor(null, { id: "q-1", response: {} }), null,
    "and nothing is answered when no prompt is open");

  const long = project.entriesToTurns([
    messageEntry("u9", { role: "user", content: "big", timestamp: 0 }),
    messageEntry("a9", { role: "assistant", timestamp: 0, content: [
      { type: "toolCall", id: "c9", name: "bash", arguments: { command: "cat huge" } }] }),
    messageEntry("r9", { role: "toolResult", toolCallId: "c9", toolName: "bash", isError: false,
      content: [{ type: "text", text: "x".repeat(50000) }], timestamp: 0 }),
  ]);
  assert.ok(long[0].tools[0].detail.length < project.LIMIT.detail + 60,
    "a state file stays readable inside the reader's 1 MiB read");
  assert.match(long[0].tools[0].detail, /\[truncated 48000 chars\]$/);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-ui-bridge-"));
  const read = (name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
  const box = bridge.createWriter(dir, { sessionId: "s-1", cwd: "/tmp/project" });
  assert.equal(read("meta.json").sessionId, "s-1");
  assert.equal(read("meta.json").cwd, "/tmp/project");
  assert.equal(read("meta.json").version, 2);

  box.done(turns);
  assert.equal(read("done.json").turns.length, 2);
  assert.equal(read("done.json").epoch, box.epoch);

  const liveTurn = { id: "t-1", prompt: "hi", status: "working", messages: [], tools: [] };
  box.live(liveTurn, true);
  assert.equal(read("live.json").turn.id, "t-1");
  const firstWrite = read("live.json").revision;
  liveTurn.messages.push({ id: "a-1", role: "assistant", text: "partial", open: true });
  box.live(liveTurn);
  box.live(liveTurn);
  assert.equal(box.live(liveTurn), null, "streaming rewrites are throttled");
  assert.equal(read("live.json").revision, firstWrite, "a throttled flush writes nothing");
  box.live(liveTurn, true);
  assert.equal(read("live.json").turn.messages[0].text, "partial", "a forced flush carries the newest text");
  assert.ok(read("live.json").revision > firstWrite);

  box.live(null, true);
  assert.equal(read("live.json").turn, null, "a settled session has no turn in flight");
  assert.equal(fs.readdirSync(dir).filter((name) => name.startsWith("ev-")).length, 0,
    "nothing is appended: there is no event log to prune");
  assert.equal(fs.readdirSync(dir).some((name) => name.endsWith(".tmp")), false,
    "a reader never sees half a file");

  box.close();
  assert.equal(read("meta.json").closed, true, "a closed bridge is not a stale one");
  assert.deepEqual(Array.from(fs.readdirSync(dir).sort()),
    ["done.json", "live.json", "meta.json"], "the whole bridge is three small files");

  fs.rmSync(dir, { recursive: true, force: true });
  assert.equal(typeof (await import("data:text/javascript;base64," + Buffer
    .from(fs.readFileSync(path.join(root, "mods/agent-ui/bridge/herdr-agent-ui.js"))).toString("base64"))).default,
  "function", "the file is one extension: a default export takes pi");

  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-ui-root-"));
  const dead = path.join(rootDir, "999999999");
  const live = path.join(rootDir, String(process.pid));
  const noise = path.join(rootDir, "not-a-pid");
  for (const dir of [dead, live, noise]) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "meta.json"), "{}");
  }
  const mine = bridge.createWriter(path.join(rootDir, String(process.pid)), {});
  assert.equal(fs.existsSync(dead), false, "a folder whose Pi exited is removed");
  assert.equal(fs.existsSync(live), true, "a running Pi keeps its folder");
  assert.equal(fs.existsSync(noise), true, "anything that is not a pid is not touched");
  mine.close();
  assert.equal(JSON.parse(fs.readFileSync(path.join(live, "meta.json"), "utf8")).closed, true,
    "closing marks the folder, it does not delete it");
  fs.rmSync(rootDir, { recursive: true, force: true });

  console.log("PASS: bridge — one extension file, entries projected, three state files, throttled live flush, close.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
