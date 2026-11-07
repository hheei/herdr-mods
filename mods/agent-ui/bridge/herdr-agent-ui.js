// Herdr Agent UI bridge -- one file, because one extension file is all Pi needs.
//
// Publishes what this Pi session is doing into
//   <HERDR_APP_HOME|~/.config/herdr-app>/agent-ui/bridge/<pid>/
// as three small state files, so a Mod can render it without a socket:
//
//   meta.json   {version, epoch, revision, pid, sessionId, cwd, startedAt, closed?}
//   done.json   {version, epoch, revision, turns}   settled turns, capped like the view
//   live.json   {version, epoch, revision, turn, asking}  the turn in flight, or null
//
// `asking` is the question @hheei/pi-ask-user is waiting on: its heading and the
// questions with their options, taken from the `pi-ask-user:question` event it
// emits. Pi has no "the agent is waiting for you" event of its own, so we adapt to
// the plugin that does rather than guessing from punctuation. An answer comes back
// as answer.json in this same directory and is handed to the plugin's
// `pi-ask-user:answer` channel, which resolves the prompt exactly as a keystroke
// would. Without that plugin the field is null and nothing claims to be waiting.
//
// The files are rewritten in place, so a reader's latest read simply wins: no
// sequence numbers, no gap detection, no pruning. Read-only in both directions:
// nothing here sends anything to Pi, and every write is guarded -- a broken
// display bridge must never stop the agent.
import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

// Streaming rewrites live.json at most this often; a settled turn is immediate.
export const LIVE_MS = 200;
// The reader may only read 1 MiB at a time, so payloads are clipped on the way
// out. These match what the view truncates anyway.
export const LIMIT = { text: 20000, detail: 2000 };
export const DONE_LIMIT = 200;

const KINDS = { read: "read", grep: "search", glob: "search", ls: "search", bash: "exec", edit: "edit", write: "edit", multi_edit: "edit" };

export function kindOf(toolName) {
  return KINDS[toolName] ?? "custom"; // an unknown tool keeps its own identity
}

export function targetOf(args) {
  const value = args?.command ?? args?.path ?? args?.pattern ?? args?.query ?? args?.url ?? "";
  const text = String(value);
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

export function textOf(message) {
  const content = message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((part) => part?.type === "text").map((part) => part.text ?? "").join("");
}

// Assistant messages always carry usage. Nothing here estimates: absent fields
// stay 0 so a provider that omits cost still renders.
export function usageOf(message) {
  const usage = message?.usage;
  if (!usage) return null;
  return {
    input: usage.input ?? 0,
    output: usage.output ?? 0,
    cacheRead: usage.cacheRead ?? 0,
    total: usage.totalTokens ?? 0,
    cost: usage.cost?.total ?? 0,
  };
}

// The plugin announces the open question and closes it with `questions: null`.
export function askState(current, channel, data) {
  if (channel !== "pi-ask-user:question") return current;
  if (!data?.questions) return null;
  return { heading: data.heading ?? null, questions: data.questions };
}

export function clip(value, max) {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max)}\n\n[truncated ${text.length - max} chars]` : text;
}

// Pi's branch is a flat list of entries with a tree in their parentIds. We only
// walk it in order: one turn per user message, tool calls settled by the
// toolResult that names them, and anything unrecognized skipped rather than
// guessed at.
export function entriesToTurns(entries = []) {
  const turns = [];
  let turn = null;
  for (const entry of entries) {
    // A compaction boundary is part of the visible history, not a gap in it.
    if (entry?.type === "compaction") {
      turns.push({ id: entry.id, kind: "marker", prompt: "Context compacted",
        status: "done", messages: [], tools: [] });
      continue;
    }
    const message = entry?.message;
    if (!message) continue;
    if (message.role === "user") {
      turn = { id: entry.id, prompt: textOf(message).trim(), status: "done", messages: [], tools: [] };
      turns.push(turn);
      continue;
    }
    if (!turn) continue;
    if (message.role === "assistant") {
      const text = textOf(message);
      if (text.trim() !== "") {
        turn.messages.push({ id: entry.id, role: "assistant", text: clip(text, LIMIT.text),
          open: false, usage: usageOf(message) });
      }
      for (const part of Array.isArray(message.content) ? message.content : []) {
        if (part?.type !== "toolCall") continue;
        turn.tools.push({ id: part.id, kind: kindOf(part.name), title: part.name,
          target: targetOf(part.arguments), status: "running", detail: "" });
      }
      continue;
    }
    if (message.role === "toolResult") {
      const tool = turn.tools.find((item) => item.id === message.toolCallId);
      if (!tool) continue;
      tool.status = message.isError ? "failed" : "done";
      tool.detail = clip(textOf(message), LIMIT.detail);
    }
  }
  return turns;
}

export function createWriter(dir, info = {}) {
  const epoch = `${Date.now().toString(36)}-${process.pid.toString(36)}`;
  let revision = 0;
  let lastLive = 0;
  fs.mkdirSync(dir, { recursive: true });

  function write(name, value) {
    const target = path.join(dir, name);
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value));
    fs.renameSync(tmp, target); // a reader never sees half a file
  }

  // A Pi that exited leaves its folder behind. Removing dead ones keeps the
  // bridge root readable; a live pid (or another user's, EPERM) is left alone.
  function prune() {
    try {
      for (const name of fs.readdirSync(path.dirname(dir))) {
        if (name === path.basename(dir) || !/^\d+$/.test(name)) continue;
        let alive = true;
        try {
          process.kill(Number(name), 0);
        } catch (error) {
          alive = error?.code === "EPERM";
        }
        if (!alive) fs.rmSync(path.join(path.dirname(dir), name), { recursive: true, force: true });
      }
    } catch {
      // Nothing to prune is not a problem.
    }
  }

  function meta(extra = {}) {
    write("meta.json", { version: 2, epoch, revision, pid: process.pid,
      startedAt: new Date().toISOString(), sessionId: info.sessionId ?? null,
      name: info.name ?? null,
      cwd: info.cwd ?? null, updatedAt: new Date().toISOString(), ...extra });
  }

  prune();
  meta();

  return {
    dir,
    epoch,
    prune,
    get revision() {
      return revision;
    },
    // Everything settled: rewritten once per finished turn, not per event.
    done(turns) {
      revision += 1;
      write("done.json", { version: 2, epoch, revision, turns });
    },
    // The turn in flight: throttled unless told to flush now.
    live(turn, force = false, asking = null) {
      const now = Date.now();
      if (turn !== null && !force && now - lastLive < LIVE_MS) return null;
      lastLive = now;
      revision += 1;
      write("live.json", { version: 2, epoch, revision, turn, asking });
      return revision;
    },
    close() {
      meta({ closed: true });
    },
  };
}

export default function (pi) {
  let box = null;
  let done = [];
  let turn = null;
  let asking = null;
  let ticker = null;
  let count = 0;

  const guard = (fn) => {
    try {
      fn();
    } catch {
      // A broken display bridge must never stop the agent.
    }
  };

  const flush = (force) => guard(() => box?.live(turn, force, asking));

  const openTurn = (prompt) => {
    turn = { id: `t-${++count}`, prompt, status: "working", messages: [], tools: [] };
    flush(true);
    return turn;
  };

  const ensureTurn = () => turn ?? openTurn("");

  const settle = () => {
    if (!turn) return;
    done = [...done, { ...turn, status: "done",
      requiresUserAction: turn.asked === true }].slice(-DONE_LIMIT);
    turn = null;
    asking = null;
    guard(() => {
      box?.live(null, true);
      box?.done(done);
    });
  };

  pi.on("session_start", async (_event, ctx) => guard(() => {
    count = 0;
    turn = null;
    const appHome = process.env.HERDR_APP_HOME ?? path.join(homedir(), ".config", "herdr-app");
    box = createWriter(path.join(appHome, "agent-ui", "bridge", String(process.pid)), {
      sessionId: ctx.sessionManager.getSessionId(),
      name: ctx.sessionManager.getSessionName?.() ?? null,
      cwd: ctx.sessionManager.getCwd(),
    });
    done = entriesToTurns(ctx.sessionManager.getBranch()).slice(-DONE_LIMIT);
    box.done(done);
    box.live(null, true);
  }));

  pi.on("session_shutdown", async () => guard(() => {
    stopTicker();
    box?.close();
  }));

  pi.on("message_start", async (event) => {
    const role = event.message?.role;
    if (role === "user") {
      openTurn(textOf(event.message));
      return;
    }
    if (role !== "assistant") return;
    ensureTurn().messages.push({ id: `a-${++count}`, role: "assistant", text: "",
      open: true, usage: null });
    flush(true);
  });

  pi.on("message_update", async (event) => {
    const delta = event.assistantMessageEvent;
    const message = turn?.messages.at(-1);
    if (delta?.type !== "text_delta" || !message?.open) return;
    message.text += delta.delta;
    flush(false);
  });

  pi.on("message_end", async (event) => {
    const message = turn?.messages.at(-1);
    if (!message?.open) return;
    message.text = clip(textOf(event.message), LIMIT.text);
    message.usage = usageOf(event.message);
    message.open = false;
    flush(true);
  });

  pi.on("tool_execution_start", async (event) => {
    ensureTurn().tools.push({ id: event.toolCallId, kind: kindOf(event.toolName),
      title: event.toolName, target: targetOf(event.args), status: "running", detail: "" });
    flush(true);
  });

  pi.on("tool_execution_end", async (event) => {
    const tool = turn?.tools.find((item) => item.id === event.toolCallId);
    if (!tool) return;
    tool.status = event.isError ? "failed" : "done";
    tool.detail = clip(textOf(event.result), LIMIT.detail);
    flush(true);
  });

  pi.on("agent_settled", async () => settle());

  // A file is the only way back from a Mod, which is not an extension and cannot
  // emit. The plugin owns the prompt, so it is also the one that decides when the
  // file wins: it resolves that same await a keystroke would.
  const stopTicker = () => {
    if (ticker) clearInterval(ticker);
    ticker = null;
  };
  const answerFile = () => (box ? path.join(box.dir, "answer.json") : null);
  const pollAnswer = () => {
    const file = answerFile();
    if (!file) return;
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      return;
    }
    guard(() => fs.rmSync(file, { force: true })); // one answer, one use
    if (data?.response !== undefined) guard(() => pi.events.emit("pi-ask-user:answer", data));
  };
  const startTicker = () => {
    if (ticker || !box) return;
    // A click that lost the race to the terminal would otherwise answer the next
    // prompt instead of this one: the file is state, and stale state is dropped.
    guard(() => fs.rmSync(answerFile(), { force: true }));
    ticker = setInterval(pollAnswer, 250);
  };

  pi.events?.on?.("pi-ask-user:question", (data) => guard(() => {
    const next = askState(asking, "pi-ask-user:question", data);
    if (next === asking) return;
    asking = next;
    if (asking) {
      if (turn) turn.asked = true;
      startTicker();
    } else {
      stopTicker();
    }
    flush(true);
  }));
}
