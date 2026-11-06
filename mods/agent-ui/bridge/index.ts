// Writes what this Pi session is doing into the Agent UI mailbox.
// Read-only: nothing here sends anything to Pi, and a failure at any point must
// leave the Terminal working, so every write is guarded.
import { homedir } from "node:os";
import path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createMailbox } from "./mailbox.js";
import { clip, entriesToTurns, kindOf, LIMIT, targetOf, textOf } from "./project.js";

export default function (pi: ExtensionAPI) {
  let box: ReturnType<typeof createMailbox> | null = null;
  let here: ExtensionContext | null = null;
  let turn = "";
  let message = "";
  let count = 0;

  const guard = (fn: () => void) => {
    try {
      fn();
    } catch {
      // A broken display bridge must never stop the agent.
    }
  };

  const emit = (event: object) => guard(() => box?.emit(event));

  const startTurn = (prompt: string) => {
    turn = `t-${++count}`;
    message = "";
    emit({ type: "turn.start", turn: { id: turn, prompt } });
    return turn;
  };

  const ensureTurn = () => (turn === "" ? startTurn("") : turn);

  pi.on("session_start", async (_event, ctx) => {
    guard(() => {
      here = ctx;
      count = 0;
      turn = "";
      message = "";
      const appHome = process.env.HERDR_APP_HOME ?? path.join(homedir(), ".config", "herdr-app");
      const dir = path.join(appHome, "agent-ui", "bridge", String(process.pid));
      box = createMailbox(dir, {
        sessionId: ctx.sessionManager.getSessionId(),
        cwd: ctx.sessionManager.getCwd(),
        snapshot: () => entriesToTurns(here?.sessionManager.getBranch() ?? []),
      });
      box.snapshot(entriesToTurns(ctx.sessionManager.getBranch()));
    });
  });

  pi.on("session_shutdown", async () => guard(() => box?.close()));

  pi.on("message_start", async (event) => {
    const role = event.message?.role;
    if (role === "user") {
      startTurn(textOf(event.message));
      return;
    }
    if (role !== "assistant") return;
    const turnId = ensureTurn();
    message = `a-${++count}`;
    emit({ type: "message.start", turnId, message: { id: message } });
  });

  pi.on("message_update", async (event) => {
    const delta = event.assistantMessageEvent;
    if (delta?.type !== "text_delta" || message === "") return;
    emit({ type: "message.delta", turnId: turn, messageId: message, text: delta.delta });
  });

  pi.on("message_end", async (event) => {
    if (event.message?.role !== "assistant" || message === "") return;
    emit({ type: "message.end", turnId: turn, messageId: message, text: textOf(event.message) });
    message = "";
  });

  pi.on("tool_execution_start", async (event) => {
    const turnId = ensureTurn();
    emit({ type: "tool.start", turnId, tool: { id: event.toolCallId,
      kind: kindOf(event.toolName), title: event.toolName, target: targetOf(event.args) } });
  });

  pi.on("tool_execution_end", async (event) => {
    if (turn === "") return;
    emit({ type: "tool.update", turnId: turn, toolId: event.toolCallId,
      patch: { status: event.isError ? "failed" : "done",
        detail: clip(textOf(event.result), LIMIT.detail) } });
  });

  pi.on("agent_settled", async () => {
    if (turn === "") return;
    emit({ type: "turn.end", turnId: turn });
    turn = "";
    message = "";
  });
}
