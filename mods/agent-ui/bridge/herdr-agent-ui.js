// Herdr Agent UI bridge -- one file, because one extension file is all Pi needs.
//
// Publishes what this Pi session is doing into
//   <HERDR_APP_HOME|~/.config/herdr-app>/agent-ui/bridge/<pid>/
// as three small state files, so a Mod can render it without a socket:
//
//   meta.json   {version, epoch, revision, pid, sessionId, cwd, startedAt, closed?}
//   done.json   {version, epoch, revision, turns}   settled turns, capped like the view
//   live.json   {version, epoch, revision, turn}    the turn in flight, or null
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
        turn.messages.push({ id: entry.id, role: "assistant", text: clip(text, LIMIT.text), open: false });
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
    live(turn, force = false) {
      const now = Date.now();
      if (turn !== null && !force && now - lastLive < LIVE_MS) return null;
      lastLive = now;
      revision += 1;
      write("live.json", { version: 2, epoch, revision, turn });
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
  let count = 0;

  const guard = (fn) => {
    try {
      fn();
    } catch {
      // A broken display bridge must never stop the agent.
    }
  };

  const flush = (force) => guard(() => box?.live(turn, force));

  const openTurn = (prompt) => {
    turn = { id: `t-${++count}`, prompt, status: "working", messages: [], tools: [] };
    flush(true);
    return turn;
  };

  const ensureTurn = () => turn ?? openTurn("");

  const settle = () => {
    if (!turn) return;
    done = [...done, { ...turn, status: "done" }].slice(-DONE_LIMIT);
    turn = null;
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

  pi.on("session_shutdown", async () => guard(() => box?.close()));

  pi.on("message_start", async (event) => {
    const role = event.message?.role;
    if (role === "user") {
      openTurn(textOf(event.message));
      return;
    }
    if (role !== "assistant") return;
    ensureTurn().messages.push({ id: `a-${++count}`, role: "assistant", text: "", open: true });
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
}
