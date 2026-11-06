// Publishes what this Pi session is doing where the Agent UI can read it.
// Read-only and guarded: nothing here sends anything to Pi, and a failed write
// must leave the Terminal working.
import { homedir } from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createWriter } from "./mailbox.js";
import { clip, entriesToTurns, kindOf, LIMIT, targetOf, textOf } from "./project.js";

// Same ceiling the view keeps, so a long session never grows the files.
const DONE_LIMIT = 200;

export default function (pi: ExtensionAPI) {
  let box: ReturnType<typeof createWriter> | null = null;
  let done: any[] = [];
  let turn: any = null;
  let count = 0;

  const guard = (fn: () => void) => {
    try {
      fn();
    } catch {
      // A broken display bridge must never stop the agent.
    }
  };

  const flush = (force: boolean) => guard(() => box?.live(turn, force));

  const openTurn = (prompt: string) => {
    turn = { id: `t-${++count}`, prompt, status: "working", messages: [], tools: [] };
    flush(true);
    return turn;
  };

  const ensureTurn = () => turn ?? openTurn("");

  const settle = () => {
    if (!turn) return;
    const finished = { ...turn, status: "done" };
    done = [...done, finished].slice(-DONE_LIMIT);
    turn = null;
    guard(() => {
      box?.live(null, true);
      box?.done(done);
    });
  };

  pi.on("session_start", async (_event, ctx) =>
    guard(() => {
      count = 0;
      turn = null;
      const appHome = process.env.HERDR_APP_HOME ?? path.join(homedir(), ".config", "herdr-app");
      box = createWriter(path.join(appHome, "agent-ui", "bridge", String(process.pid)), {
        sessionId: ctx.sessionManager.getSessionId(),
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
    const tool = turn?.tools.find((item: any) => item.id === event.toolCallId);
    if (!tool) return;
    tool.status = event.isError ? "failed" : "done";
    tool.detail = clip(textOf(event.result), LIMIT.detail);
    flush(true);
  });

  pi.on("agent_settled", async () => settle());
}
