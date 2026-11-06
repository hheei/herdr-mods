// The bridge's mailbox: one writer, readers that only ever read.
// A reader watches the folder, reads ev-<seq>.json in order, and falls back to
// snapshot.json when a sequence number is missing.
import fs from "node:fs";
import path from "node:path";

// Every snapshot bounds the folder: older event files are deleted by it.
export const SNAPSHOT_EVERY = 64;

const pad = (seq) => String(seq).padStart(6, "0");

export function createMailbox(dir, info = {}) {
  const epoch = `${Date.now().toString(36)}-${process.pid.toString(36)}`;
  const startedAt = new Date().toISOString();
  let seq = 0;
  let since = 0;
  fs.mkdirSync(dir, { recursive: true });

  function write(name, value) {
    const target = path.join(dir, name);
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value));
    fs.renameSync(tmp, target); // a reader never sees half a file
  }

  function meta(extra = {}) {
    write("meta.json", {
      version: 1, epoch, seq, pid: process.pid, startedAt,
      sessionId: info.sessionId ?? null, cwd: info.cwd ?? null,
      updatedAt: new Date().toISOString(), ...extra,
    });
  }

  function prune(upto) {
    for (const name of fs.readdirSync(dir)) {
      const match = /^ev-(\d+)\.json$/.exec(name);
      if (match && Number(match[1]) <= upto) fs.rmSync(path.join(dir, name), { force: true });
    }
  }

  return {
    dir,
    epoch,
    get seq() {
      return seq;
    },
    snapshot(turns) {
      write("snapshot.json", { version: 1, epoch, seq, turns });
      prune(seq); // this snapshot is the state after seq, so those files are dead
      since = 0;
      meta();
    },
    emit(event) {
      seq += 1;
      const stamped = { ...event, seq, epoch };
      write(`ev-${pad(seq)}.json`, stamped);
      since += 1;
      if (since >= SNAPSHOT_EVERY) {
        const turns = typeof info.snapshot === "function" ? info.snapshot() : null;
        if (Array.isArray(turns)) this.snapshot(turns);
      }
      meta();
      return stamped;
    },
    close() {
      meta({ closed: true });
    },
  };
}
