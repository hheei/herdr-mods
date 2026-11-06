// Deterministic, side-effect-free projections for the v2 synthetic prototype.
const TYPES = { read: "Read", search: "Search", exec: "Run", edit: "Edit", custom: "Other" };
export function summarizeActivity(tools = []) {
  const counts = {};
  let failed = 0, pending = 0, running = 0;
  for (const tool of tools) {
    const name = TYPES[tool.kind] ?? "Other";
    counts[name] = (counts[name] ?? 0) + 1;
    if (tool.status === "failed") failed++;
    if (tool.status === "pending") pending++;
    if (tool.status === "running") running++;
  }
  const parts = Object.entries(counts).map(([kind, n]) => `${kind} ${n}`);
  const label = `${tools.length} operations${parts.length ? " · " + parts.join(" · ") : ""}`;
  const status = failed ? `! ${failed} failed` : pending ? `! ${pending} pending`
    : running ? `● ${running} working` : "Done";
  return { label, status, failed, pending, running, total: tools.length };
}

export function shortPrompt(prompt, max = 39) {
  const plain = String(prompt ?? "").replace(/\s+/g, " ").replace(/[*_`#<>]/g, "").trim();
  if (!plain) return "內容未載入";
  return plain.length > max ? plain.slice(0, max - 1).trimEnd() + "…" : plain;
}

export function actionable(turn) {
  // Only unresolved user action is important enough for the second hover line.
  return turn?.status === "needs-input";
}

export function toRailNodes(turns) {
  return turns.map((turn) => ({
    id: turn.id,
    preview: shortPrompt(turn.prompt),
    actionable: actionable(turn),
    status: turn.status,
  }));
}

export function windowFromTurn(turns, targetId) {
  const index = turns.findIndex((t) => t.id === targetId);
  return index <= 0 ? turns : turns.slice(index);
}
