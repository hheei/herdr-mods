// Event -> transcript reducer. Pure: no host objects, no cx, no timers.
// A bridge event and a fixture event take exactly this path.

const SEEN_LIMIT = 512;

function cloneTurn(turn) {
  return {
    ...turn,
    messages: (turn.messages ?? []).map((message) => ({ ...message })),
    tools: (turn.tools ?? []).map((tool) => ({ ...tool })),
  };
}

export function createTranscript(turns = []) {
  return { turns: turns.map(cloneTurn), seen: [] };
}

export function deriveStatus(turn) {
  if (turn.requiresUserAction) return "needs-input";
  const open = (turn.messages ?? []).some((message) => message.open);
  const busy = (turn.tools ?? []).some((tool) => tool.status === "running" || tool.status === "pending");
  return open || busy ? "working" : "done";
}

function findTurn(state, id) {
  return state.turns.find((turn) => turn.id === id) ?? null;
}

function unchanged(state) {
  return { state, changed: false, grew: false };
}

export function applyEvent(state, event) {
  if (!event || typeof event.type !== "string") return unchanged(state);
  // A bridge may deliver the same event twice after a reconnect.
  if (event.id && state.seen.includes(event.id)) return unchanged(state);
  const seen = event.id ? [...state.seen, event.id].slice(-SEEN_LIMIT) : state.seen;
  const withSeen = (turns) => ({ turns, seen });

  switch (event.type) {
    case "snapshot":
      return {
        state: { turns: (event.turns ?? []).map(cloneTurn), seen },
        changed: true,
        grew: true,
      };
    case "turn.start": {
      const turn = event.turn ?? {};
      if (!turn.id || findTurn(state, turn.id)) return unchanged(state);
      const next = cloneTurn({
        id: turn.id, prompt: turn.prompt ?? "", status: "working",
        messages: turn.messages ?? [], tools: turn.tools ?? [],
      });
      return { state: withSeen([...state.turns, next]), changed: true, grew: true };
    }
    default:
      break;
  }

  const turn = findTurn(state, event.turnId);
  // A delta for a turn that a reconnect already dropped is ignored, not guessed.
  if (!turn) return unchanged(state);
  const turns = state.turns.map((item) => (item.id === turn.id ? cloneTurn(item) : item));
  const target = turns.find((item) => item.id === turn.id);

  switch (event.type) {
    case "message.start": {
      const message = event.message ?? {};
      if (!message.id || target.messages.some((item) => item.id === message.id)) return unchanged(state);
      target.messages.push({ id: message.id, role: message.role ?? "assistant", text: "", open: true });
      target.status = deriveStatus(target);
      return { state: withSeen(turns), changed: true, grew: true };
    }
    case "message.delta": {
      const message = target.messages.find((item) => item.id === event.messageId);
      if (!message) return unchanged(state);
      message.text = `${message.text ?? ""}${String(event.text ?? "")}`;
      message.open = true;
      target.status = deriveStatus(target);
      return { state: withSeen(turns), changed: true, grew: true };
    }
    case "message.end": {
      const message = target.messages.find((item) => item.id === event.messageId);
      if (!message) return unchanged(state);
      if (typeof event.text === "string") message.text = event.text;
      message.open = false;
      target.status = deriveStatus(target);
      return { state: withSeen(turns), changed: true, grew: false };
    }
    case "tool.start": {
      const tool = event.tool ?? {};
      if (!tool.id || target.tools.some((item) => item.id === tool.id)) return unchanged(state);
      target.tools.push({ status: "running", ...tool });
      target.status = deriveStatus(target);
      return { state: withSeen(turns), changed: true, grew: true };
    }
    case "tool.update": {
      const tool = target.tools.find((item) => item.id === event.toolId);
      if (!tool) return unchanged(state);
      Object.assign(tool, event.patch ?? {});
      target.status = deriveStatus(target);
      return { state: withSeen(turns), changed: true, grew: false };
    }
    case "turn.action": {
      target.requiresUserAction = event.required !== false;
      target.status = deriveStatus(target);
      return { state: withSeen(turns), changed: true, grew: false };
    }
    case "turn.end": {
      for (const message of target.messages) message.open = false;
      for (const tool of target.tools) {
        if (tool.status === "running") tool.status = "done";
      }
      target.status = event.status ?? deriveStatus(target);
      return { state: withSeen(turns), changed: true, grew: false };
    }
    default:
      return unchanged(state);
  }
}
