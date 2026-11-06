// Pi session entries -> the transcript the view already knows.
// Pure, Node-only, and the only place that has to know Pi's message shapes.
const KINDS = {
  read: "read", grep: "search", glob: "search", find: "search", ls: "search",
  bash: "exec", edit: "edit", write: "edit", patch: "edit",
};

export function kindOf(name) {
  return KINDS[String(name ?? "").toLowerCase()] ?? "custom";
}

export function textOf(message) {
  if (typeof message === "string") return message;
  const content = message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((block) => block?.type === "text").map((block) => block.text ?? "").join("");
}

export function targetOf(args) {
  if (!args || typeof args !== "object") return "";
  const pick = args.command ?? args.path ?? args.file ?? args.pattern ?? args.query ?? args.url ?? "";
  const text = Array.isArray(pick) ? pick.join(" ") : String(pick);
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

// One turn per user message. Everything Pi wrote on that branch becomes its
// messages and tools, and a tool call is settled by the toolResult that names it.
export function entriesToTurns(entries = []) {
  const turns = [];
  const tools = new Map();
  let current = null;

  const open = (id, prompt) => {
    current = { id, prompt, status: "done", messages: [], tools: [] };
    turns.push(current);
    return current;
  };

  for (const entry of entries) {
    if (entry?.type !== "message") continue;
    const message = entry.message ?? {};

    if (message.role === "user") {
      open(entry.id, textOf(message));
      continue;
    }

    if (message.role === "assistant") {
      const turn = current ?? open(entry.id, "");
      const calls = Array.isArray(message.content)
        ? message.content.filter((block) => block?.type === "toolCall") : [];
      const text = textOf(message);
      if (text || calls.length === 0) {
        turn.messages.push({ id: entry.id, role: "assistant", text, open: false });
      }
      for (const call of calls) {
        if (!call?.id) continue;
        const tool = { id: call.id, kind: kindOf(call.name), title: String(call.name ?? "Tool"),
          target: targetOf(call.arguments), status: "running", detail: "" };
        tools.set(call.id, tool);
        turn.tools.push(tool);
      }
      continue;
    }

    if (message.role === "toolResult") {
      const tool = tools.get(message.toolCallId);
      if (!tool) continue;
      tool.status = message.isError ? "failed" : "done";
      tool.detail = textOf(message);
    }
  }

  // A snapshot is settled history: Pi already finished every call it wrote down.
  for (const tool of tools.values()) if (tool.status === "running") tool.status = "done";
  return turns;
}
