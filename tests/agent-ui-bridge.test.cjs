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
  const project = await load("mods/agent-ui/bridge/project.js");
  const mailbox = await load("mods/agent-ui/bridge/mailbox.js");

  assert.equal(project.kindOf("bash"), "exec");
  assert.equal(project.kindOf("grep"), "search");
  assert.equal(project.kindOf("write"), "edit");
  assert.equal(project.kindOf("mystery"), "custom", "an unknown tool keeps its own kind");
  assert.equal(project.targetOf({ command: "npm test" }), "npm test");
  assert.equal(project.targetOf({ path: "a/b.ts" }), "a/b.ts");
  assert.equal(project.targetOf({ command: "x".repeat(200) }).length, 80);
  assert.equal(project.textOf({ content: [{ type: "text", text: "a" }, { type: "image" }] }), "a");
  assert.equal(project.textOf("plain"), "plain");

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
  const box = mailbox.createWriter(dir, { sessionId: "s-1", cwd: "/tmp/project" });
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
  console.log("PASS: bridge writer — entries projected, three state files, throttled live flush, close.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
