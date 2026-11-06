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

// Rail dots live in one fixed column at the vertical centre, 3px apart, and the
// whole column never exceeds 40% of the viewport. Longer histories are grouped
// into one dot per bucket, the way editor scrollbar markers collapse dense runs
// instead of shrinking to meaningless hairlines.
export function railLayout(ranges, viewportHeight, visibleIds = []) {
  const gap = 3, minDot = 6, peakDot = 11, cap = 0.4;
  const pitch = peakDot + gap;
  const maxDots = Math.max(1, Math.floor((viewportHeight * cap) / pitch));
  const perDot = Math.max(1, Math.ceil(ranges.length / maxDots));
  const groups = [];
  for (let i = 0; i < ranges.length; i += perDot) {
    const turnIds = ranges.slice(i, i + perDot).map((range) => range.id);
    groups.push({ id: turnIds[0], turnIds });
  }
  const visible = new Set(visibleIds);
  const mid = (groups.length - 1) / 2;
  let focus = Math.floor(mid), best = Infinity;
  groups.forEach((group, index) => {
    if (!group.turnIds.some((id) => visible.has(id))) return;
    const distance = Math.abs(index - mid);
    if (distance < best) {
      best = distance;
      focus = index;
    }
  });
  const span = groups.length * pitch;
  const first = Math.max(pitch / 2, (viewportHeight - span) / 2 + pitch / 2);
  return {
    pitch,
    perDot,
    focus,
    dots: groups.map((group, index) => ({
      ...group,
      center: first + index * pitch,
      size: dotSize(index, focus, minDot, peakDot),
      visible: group.turnIds.some((id) => visible.has(id)),
    })),
  };
}

// A Gaussian wave packet: the dot at the reading position is widest and its
// neighbours fall away to the 6px floor, so the column reads as one focus.
export function dotSize(index, focus, min = 6, peak = 11, sigma = 1.5) {
  const z = (index - focus) / sigma;
  return Math.max(min, Math.round(min + (peak - min) * Math.exp(-z * z)));
}

// A dot click selects that dot's first turn. Space outside the dots scrubs;
// there is no independent scrollbar track or thumb.
export function railHit(dots, x, y, centerX = 9, radius = 7) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x - centerX) > radius) return null;
  let winner = null, distance = radius + 1;
  for (const dot of dots) {
    const dy = Math.abs(y - dot.center);
    if (dy <= radius && dy < distance) {
      winner = dot.id;
      distance = dy;
    }
  }
  return winner;
}

export function previewTop(pinTop, viewportHeight, actionablePreview = false) {
  const height = actionablePreview ? 52 : 36;
  return Math.max(4, Math.min(pinTop - 5, viewportHeight - height - 4));
}

// The rail IS the scrollbar: dragging vertically scrubs the sole transcript
// scrollY across its full range. The visible-turn dots are the position indicator.
export function railScrubOffset(pointerY, contentHeight, viewportHeight, inset = 8) {
  const travel = Math.max(1, viewportHeight - 2 * inset);
  const fraction = Math.max(0, Math.min(1, (pointerY - inset) / travel));
  return fraction * Math.max(0, contentHeight - viewportHeight);
}
