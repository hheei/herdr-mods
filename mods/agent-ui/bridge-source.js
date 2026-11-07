// @ts-check
// The reader half of the bridge: two state files per Pi process, watched.
// The diff here is pure, so the host glue in main.js is the only part a test
// cannot reach.
export const SOURCE_KEY = "agent-ui-source";

export function initialBridge() {
  return { epoch: null, doneRevision: -1, liveRevision: -1, asking: null };
}

// Payload is whatever three files existed: {meta, done, live}. Missing files are
// null, which is a fact too -- it is how a vanished Pi looks.
export function readBridge(previous, payload) {
  const meta = payload?.meta ?? null;
  const done = payload?.done ?? null;
  const live = payload?.live ?? null;
  const turns = done?.turns ?? [];
  const health = !meta ? "missing" : meta.closed ? "closed" : "live";
  const events = [];

  if (!meta) return { state: initialBridge(), events, health };

  // The question ask-user is waiting on is its own event: it changes while the
  // turn itself is untouched, and it must arrive even if nothing else moved.
  const asking = live?.asking ?? null;
  if (JSON.stringify(previous?.asking ?? null) !== JSON.stringify(asking))
    events.push({ type: "asking", asking });

  const sameEpoch = previous?.epoch === meta.epoch;
  const state = {
    epoch: meta.epoch,
    doneRevision: sameEpoch ? previous.doneRevision : -1,
    liveRevision: sameEpoch ? previous.liveRevision : -1,
    asking,
  };

  // A new epoch is a new Pi process: the old transcript is not this one's.
  if (!sameEpoch) {
    events.push({ type: "snapshot", turns });
    if (live?.turn) events.push({ type: "turn.replace", turn: live.turn });
    state.doneRevision = done?.revision ?? -1;
    state.liveRevision = live?.revision ?? -1;
    return { state, events, health };
  }

  if (done && done.revision !== state.doneRevision) {
    state.doneRevision = done.revision;
    state.liveRevision = live?.revision ?? state.liveRevision;
    events.push({ type: "snapshot", turns });
    if (live?.turn) events.push({ type: "turn.replace", turn: live.turn });
    return { state, events, health };
  }

  if (live && live.revision !== state.liveRevision) {
    state.liveRevision = live.revision;
    // A settled turn leaves live.json null; the done snapshot already has it.
    events.push(live.turn
      ? { type: "turn.replace", turn: live.turn }
      : { type: "snapshot", turns });
  }

  return { state, events, health };
}

export function createBridgeSource(host) {
  let state = initialBridge();
  let dir = host.initialDir ?? null;
  const queue = [];

  return {
    kind: "bridge",
    get dir() {
      return dir;
    },
    get health() {
      return state.health ?? "missing";
    },
    snapshot() {
      return [];
    },
    take() {
      return queue.shift() ?? null;
    },
    // A bridge has no clock of its own: the host loop pushes.
    streaming() {
      return false;
    },
    step() {
      return false;
    },
    async refresh() {
      if (!dir) dir = await host.find();
      if (!dir) {
        state = { ...initialBridge(), health: "missing" };
        return false;
      }
      const payload = await host.read(dir);
      // A vanished directory means the Pi that owned it exited: find again.
      if (!payload.meta) dir = null;
      const result = readBridge(state, payload);
      state = { ...result.state, health: result.health };
      if (result.events.length === 0) return false;
      queue.push(...result.events);
      return true;
    },
  };
}
