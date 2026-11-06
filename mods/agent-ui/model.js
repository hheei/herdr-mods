// Deterministic, side-effect-free projections for the synthetic prototype.
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
  // Tool failure/pending is NOT a request for user action. This flag must be
  // explicitly supplied by a runtime event that needs the user's response.
  return turn?.requiresUserAction === true;
}

export function toRailNodes(turns) {
  return turns.map((turn) => ({
    id: turn.id,
    preview: shortPrompt(turn.prompt),
    actionable: actionable(turn),
    status: turn.status,
  }));
}

// Real turn heights come from GPUI on_size_change, not guessed row numbers.
// The fallback is only used during the first layout pass.
export function turnGeometry(turns, measured, gap = 19, padding = 18) {
  let y = padding, complete = true;
  const ranges = turns.map((turn) => {
    const measuredHeight = measured.get(turn.id);
    if (!Number.isFinite(measuredHeight) || measuredHeight <= 0) complete = false;
    const height = Number.isFinite(measuredHeight) && measuredHeight > 0
      ? measuredHeight : 200;
    const range = { id: turn.id, start: y, end: y + height };
    y += height + gap;
    return range;
  });
  return { ranges, total: y - (turns.length ? gap : 0) + padding, complete };
}

export function clampScroll(offset, contentHeight, viewportHeight) {
  return Math.max(0, Math.min(Number(offset) || 0,
    Math.max(0, contentHeight - viewportHeight)));
}

export function visibleTurnIds(ranges, scrollY, viewportHeight) {
  const end = scrollY + Math.max(0, viewportHeight);
  return ranges.filter((r) => r.end > scrollY && r.start < end).map((r) => r.id);
}

export function railMarkers(ranges, contentHeight, viewportHeight) {
  const margin = 7, pinHeight = 16;
  const available = Math.max(0, viewportHeight - pinHeight - 2 * margin);
  const length = Math.max(1, contentHeight);
  // Keep normal-length histories clickable, while never letting a marker
  // spill outside the rail. Very dense histories need a future cluster view.
  const gap = Math.min(16, available / Math.max(1, ranges.length - 1));
  let previous = -Infinity;
  return ranges.map((r, i) => {
    const raw = margin + available * (r.start / length);
    const maxTop = margin + available - gap * (ranges.length - 1 - i);
    const top = Math.max(margin + i * gap,
      Math.min(maxTop, Math.max(raw, previous + gap)));
    previous = top;
    return { id: r.id, top };
  });
}

export function previewTop(pinTop, viewportHeight, actionablePreview = false) {
  const height = actionablePreview ? 52 : 36;
  return Math.max(4, Math.min(pinTop - 5, viewportHeight - height - 4));
}

// Single scroll owner: the transcript, rail, wheel and scrollbar all consume
// this geometry. The scrollbar never has an independent scroll offset.
export function scrollbarGeometry(contentHeight, viewportHeight, scrollY, inset = 8, minThumb = 24) {
  const trackHeight = Math.max(0, viewportHeight - 2 * inset);
  const maxScroll = Math.max(0, contentHeight - viewportHeight);
  const scrollable = maxScroll > 0 && trackHeight > 0;
  if (!scrollable) return {
    scrollable: false, trackTop: inset, trackHeight, thumbTop: inset,
    thumbHeight: trackHeight, travel: 0, maxScroll: 0,
  };
  const thumbHeight = Math.min(trackHeight, Math.max(minThumb,
    trackHeight * Math.min(1, viewportHeight / contentHeight)));
  const travel = Math.max(0, trackHeight - thumbHeight);
  const thumbTop = inset + travel * clampScroll(scrollY, contentHeight, viewportHeight) / maxScroll;
  return { scrollable, trackTop: inset, trackHeight, thumbTop, thumbHeight, travel, maxScroll };
}

export function scrollbarOffsetAt(pointerY, geometry, grab = geometry.thumbHeight / 2) {
  if (!geometry.scrollable || geometry.travel <= 0) return 0;
  return Math.max(0, Math.min(geometry.maxScroll,
    (pointerY - geometry.trackTop - grab) / geometry.travel * geometry.maxScroll));
}
