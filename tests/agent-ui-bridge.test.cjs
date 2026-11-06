// The writer side of the bridge: Pi entries in, mailbox files out.
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
    "a snapshot stays readable inside the reader's 1 MiB read");
  assert.match(long[0].tools[0].detail, /\[truncated 48000 chars\]$/);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-ui-bridge-"));
  let built = [];
  const box = mailbox.createMailbox(dir, { sessionId: "s-1", cwd: "/tmp/project",
    snapshot: () => built });
  assert.equal(fs.existsSync(path.join(dir, "meta.json")), false, "nothing is written until asked");

  built = turns;
  box.snapshot(turns);
  const snapshot = JSON.parse(fs.readFileSync(path.join(dir, "snapshot.json"), "utf8"));
  assert.equal(snapshot.turns.length, 2);
  assert.equal(snapshot.epoch, box.epoch);
  assert.equal(box.epoch, JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8")).epoch);
  const meta = () => JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
  assert.equal(meta().sessionId, "s-1");
  assert.equal(meta().cwd, "/tmp/project");

  box.emit({ type: "turn.start", turn: { id: "t-1", prompt: "hi" } });
  box.emit({ type: "turn.end", turnId: "t-1" });
  const first = JSON.parse(fs.readFileSync(path.join(dir, "ev-000001.json"), "utf8"));
  assert.equal(first.seq, 1);
  assert.equal(first.epoch, box.epoch);
  assert.equal(first.type, "turn.start");
  assert.equal(meta().seq, 2, "meta tells a reader which sequence number to read next");
  assert.equal(fs.readdirSync(dir).some((name) => name.endsWith(".tmp")), false,
    "a reader never sees half a file");

  box.snapshot(turns);
  assert.equal(fs.existsSync(path.join(dir, "ev-000001.json")), false,
    "the snapshot folds earlier events away");
  assert.equal(fs.existsSync(path.join(dir, "ev-000002.json")), false);

  const many = mailbox.createMailbox(fs.mkdtempSync(path.join(os.tmpdir(), "agent-ui-ring-")),
    { snapshot: () => turns });
  for (let i = 0; i < mailbox.SNAPSHOT_EVERY + 1; i++) many.emit({ type: "turn.end", turnId: `t-${i}` });
  assert.ok(fs.existsSync(path.join(many.dir, "snapshot.json")),
    "a long run folds itself into a snapshot instead of growing forever");
  assert.equal(fs.readdirSync(many.dir).filter((name) => name.startsWith("ev-")).length, 1,
    "only the event after the folding snapshot survives");

  box.close();
  assert.equal(meta().closed, true, "a closed bridge is not a stale one");

  fs.rmSync(dir, { recursive: true, force: true });
  console.log("PASS: bridge writer — entries projected, atomic files, seq/epoch, folding, close.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
