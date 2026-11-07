// @ts-check
// Event -> transcript reducer. Pure: no host objects, no cx, no timers.
// A bridge event and a fixture event take exactly this path.

const SEEN_LIMIT = 512;
// Rendering, not the geometry math, is what grows with history: 200 turns build
// in ~2ms a frame, 2000 in ~27ms. Past the limit the oldest turns are dropped,
// the way a terminal bounds its scrollback.
const TURN_LIMIT = 200;

function cloneTurn(turn) {
  return {
    ...turn,
    messages: (turn.messages ?? []).map((message) => ({ ...message })),
    tools: (turn.tools ?? []).map((tool) => ({ ...tool })),
  };
}

function keep(turns, limit) {
  if (turns.length <= limit) return { turns, dropped: [] };
  const cut = turns.slice(0, turns.length - limit);
  return { turns: turns.slice(cut.length), dropped: cut.map((turn) => turn.id) };
}

export function createTranscript(turns = [], limit = TURN_LIMIT) {
  const kept = keep(turns.map(cloneTurn), limit);
  return { turns: kept.turns, seen: [], limit };
}

// A bridge republishes the whole turn in flight, so growth is what a reader sees:
// longer text or a longer tool output means something arrived.
function weight(turn) {
  let total = String(turn?.prompt ?? "").length;
  for (const message of turn?.messages ?? []) total += String(message?.text ?? "").length;
  for (const tool of turn?.tools ?? []) total += String(tool?.detail ?? "").length;
  return total;
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
  return { state, changed: false, grew: false, dropped: [] };
}

export function applyEvent(state, event) {
  if (!event || typeof event.type !== "string") return unchanged(state);
  // A bridge may deliver the same event twice after a reconnect.
  if (event.id && state.seen.includes(event.id)) return unchanged(state);
  const seen = event.id ? [...state.seen, event.id].slice(-SEEN_LIMIT) : state.seen;
  const withSeen = (turns) => ({ turns, seen, limit: state.limit });

  switch (event.type) {
    case "snapshot": {
      const kept = keep((event.turns ?? []).map(cloneTurn), state.limit);
      return { state: { ...kept, seen, limit: state.limit }, changed: true, grew: true, dropped: kept.dropped };
    }
    case "turn.start": {
      const turn = event.turn ?? {};
      if (!turn.id || findTurn(state, turn.id)) return unchanged(state);
      const next = cloneTurn({
        id: turn.id, prompt: turn.prompt ?? "", status: "working",
        messages: turn.messages ?? [], tools: turn.tools ?? [],
      });
      const kept = keep([...state.turns, next], state.limit);
      return { state: { ...withSeen(kept.turns), limit: state.limit },
        changed: true, grew: true, dropped: kept.dropped };
    }
    case "turn.replace": {
      const turn = event.turn ?? {};
      if (!turn.id) return unchanged(state);
      const existing = findTurn(state, turn.id);
      const next = cloneTurn({
        ...turn,
        id: turn.id,
        prompt: turn.prompt ?? "",
        status: turn.status ?? "working",
        messages: turn.messages ?? [],
        tools: turn.tools ?? [],
      });
      const turns = existing
        ? state.turns.map((item) => (item.id === turn.id ? next : item))
        : [...state.turns, next];
      const kept = keep(turns, state.limit);
      return { state: { ...withSeen(kept.turns), limit: state.limit }, changed: true,
        grew: !existing || weight(next) > weight(existing), dropped: kept.dropped };
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
