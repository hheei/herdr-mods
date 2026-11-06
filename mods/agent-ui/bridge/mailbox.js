// The bridge's only job: publish the current state of this Pi session where the
// view can read it. Two small files, rewritten in place, and nothing appended.
// A reader's "latest read wins" is correct because these are states, not deltas.
import fs from "node:fs";
import path from "node:path";

// Streaming rewrites live.json at most this often; a settled turn is immediate.
export const LIVE_MS = 200;

export function createWriter(dir, info = {}) {
  const epoch = `${Date.now().toString(36)}-${process.pid.toString(36)}`;
  const startedAt = new Date().toISOString();
  let revision = 0;
  let lastLive = 0;
  fs.mkdirSync(dir, { recursive: true });

  function write(name, value) {
    const target = path.join(dir, name);
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value));
    fs.renameSync(tmp, target); // a reader never sees half a file
  }

  function meta(extra = {}) {
    write("meta.json", {
      version: 2, epoch, revision, pid: process.pid, startedAt,
      sessionId: info.sessionId ?? null, cwd: info.cwd ?? null,
      updatedAt: new Date().toISOString(), ...extra,
    });
  }

  meta();

  return {
    dir,
    epoch,
    get revision() {
      return revision;
    },
    // Everything settled. Rewritten once per finished turn, not per event.
    done(turns) {
      revision += 1;
      write("done.json", { version: 2, epoch, revision, turns });
      return revision;
    },
    // The turn in flight. Throttled unless told to flush now.
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
