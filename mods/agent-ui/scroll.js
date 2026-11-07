// @ts-check
// Measuring, scrolling, the rail's pointer gestures and the keyboard.
// Every function here takes the view as `self`, so the state stays one object.
import { home, notify } from "herdr";
import { clampScroll, railHit, railLayout, railScrubOffset, turnGeometry, visibleTurnIds } from "./model.js";
import { askKey } from "./ask.js";

export function restoreTop(self, top) {
  if (!top) return;
  const range = turnGeometry(self.turns, self.turnHeights).ranges
    .find((item) => item.id === top);
  if (range) self.scrollY = range.start;
  self.viewportTop = null;
}

export function anchor(self, kind) {
  if (self.stick) {
    const geometry = turnGeometry(self.turns, self.turnHeights);
    self.scrollY = clampScroll(geometry.total, geometry.total, self.viewportHeight);
    self.live = 0;
    self.newTurns = 0;
    return;
  }
  if (kind === "turn") self.newTurns += 1;
  else self.live += 1;
}

export function atLimit(self, event) {
  return event.type === "turn.start" && self.turns.length >= self.transcript.limit;
}

export function changeSize(self, size, cx) {
  const width = Math.round(size?.width ?? 800);
  if (Math.abs(width - self.width) >= 16) {
    self.width = width;
    if (width < 240) self.hoveredTurn = null;
    cx.notify();
  }
}

export function measureViewport(self, size, cx) {
  const height = Math.max(1, Math.round(size?.height ?? self.viewportHeight));
  if (Math.abs(height - self.viewportHeight) < 1) return;
  self.viewportHeight = height;
  self.railGesture = null;
  if (height < 80) self.hoveredTurn = null;
  const geometry = turnGeometry(self.turns, self.turnHeights);
  self.scrollY = clampScroll(self.scrollY, geometry.total, height);
  cx.notify();
}

export function measureTurn(self, id, size, cx) {
  const height = Number(size?.height);
  if (!Number.isFinite(height) || height <= 0) return;
  const oldHeight = self.turnHeights.get(id);
  if (oldHeight !== undefined && Math.abs(oldHeight - height) < 0.75) return;
  const before = turnGeometry(self.turns, self.turnHeights);
  const previous = before.ranges.find((r) => r.id === id);
  self.turnHeights.set(id, height);
  // Preserve the current reading anchor if a collapsed/expanded group
  // above the viewport changes size. Exact jump targets override self.
  if (!self.pendingJump && oldHeight !== undefined && previous?.end <= self.scrollY) {
    self.scrollY += height - oldHeight;
  }
  const after = turnGeometry(self.turns, self.turnHeights);
  if (self.pendingJump) {
    const target = after.ranges.find((r) => r.id === self.pendingJump);
    if (target) self.scrollY = target.start;
    if (after.complete) self.pendingJump = null;
  }
  if (self.stick) self.scrollY = clampScroll(after.total, after.total, self.viewportHeight);
  else self.scrollY = clampScroll(self.scrollY, after.total, self.viewportHeight);
  cx.notify();
}

export function scrollWheel(self, event, cx) {
  // Herdr's native palette documents the bridge's pixel e.delta.y.
  const delta = Number(event?.delta?.y);
  if (!Number.isFinite(delta) || !delta) return;
  const geometry = turnGeometry(self.turns, self.turnHeights);
  const next = clampScroll(self.scrollY - delta, geometry.total, self.viewportHeight);
  self.pendingJump = null;
  if (next === self.scrollY) return;
  self.scrollY = next;
  cx.stop_propagation();
  cx.notify();
}

export function setRailScroll(self, value, cx) {
  const geometry = turnGeometry(self.turns, self.turnHeights);
  const next = clampScroll(value, geometry.total, self.viewportHeight);
  self.pendingJump = null;
  if (next === self.scrollY) return;
  self.scrollY = next;
  cx.notify();
}

export function railDragMove(self, event, cx) {
  const gesture = self.railGesture;
  if (!gesture) return;
  const screenY = Number(event?.position?.y);
  if (!Number.isFinite(screenY)) return;
  if (gesture.mode === "pin") {
    if (Math.abs(screenY - gesture.screenY) < 5) return;
    gesture.mode = "scrub";
    self.hoveredTurn = null;
  }
  const localY = screenY - gesture.originScreenY;
  const geometry = turnGeometry(self.turns, self.turnHeights);
  setRailScroll(self, railScrubOffset(localY, geometry.total, self.viewportHeight), cx);
  cx.stop_propagation();
}

export function cancelRailGesture(self, cx) {
  if (!self.railGesture) return;
  self.railGesture = null;
  cx.notify();
}

export function railPointer(self, event) {
  const y = Number.isFinite(Number(event?.local_position?.y))
    ? Number(event.local_position.y) : Number(event?.position?.y) - Number(event?.bounds?.y);
  const x = Number.isFinite(Number(event?.local_position?.x))
    ? Number(event.local_position.x) : Number(event?.position?.x) - Number(event?.bounds?.x);
  return { x, y };
}

export function railPress(self, event, cx) {
  const { x, y } = railPointer(self, event);
  const screenY = Number(event?.position?.y);
  if (!Number.isFinite(screenY) || !Number.isFinite(y)) return;
  const geometry = turnGeometry(self.turns, self.turnHeights);
  const layout = railLayout(geometry.ranges, self.viewportHeight,
    visibleTurnIds(geometry.ranges, self.scrollY, self.viewportHeight));
  const id = self.viewportHeight >= 80 ? railHit(layout.dots, x, y) : null;
  self.railGesture = {
    mode: id ? "pin" : "scrub", id, screenY, originScreenY: screenY - y,
  };
  self.hoveredTurn = null;
  if (!id) {
    // Empty space between dots also scrolls: no track/thumb is drawn.
    setRailScroll(self, railScrubOffset(y, geometry.total, self.viewportHeight), cx);
  }
  cx.stop_propagation();
}

export function railMove(self, event, cx) {
  if (self.railGesture) {
    railDragMove(self, event, cx);
    return;
  }
  if (self.viewportHeight < 80) return;
  const { x, y } = railPointer(self, event);
  const geometry = turnGeometry(self.turns, self.turnHeights);
  const layout = railLayout(geometry.ranges, self.viewportHeight,
    visibleTurnIds(geometry.ranges, self.scrollY, self.viewportHeight));
  const id = railHit(layout.dots, x, y);
  if (id !== self.hoveredTurn) {
    self.hoveredTurn = id;
    cx.notify();
  }
}

export function railRelease(self, cx) {
  const pressed = self.railGesture;
  if (!pressed) return;
  self.railGesture = null;
  if (pressed.mode === "pin") selectTurn(self, pressed.id, cx);
  cx.stop_propagation();
  cx.notify();
}

export function jumpToBottom(self, cx) {
  const geometry = turnGeometry(self.turns, self.turnHeights);
  self.scrollY = clampScroll(geometry.total, geometry.total, self.viewportHeight);
  self.pendingJump = null;
  self.stick = true;
  self.newTurns = 0;
  self.live = 0;
  cx.notify();
}

export function tick(self, cx) {
  // Time is a fixture concern; a bridge pushes its own events.
  if (self.source.step()) self.pump(cx);
}

export function demoAppend(self, cx) {
  self.source.arrive();
  self.pump(cx);
}

export function setMode(self, mode, cx) {
  if (mode !== self.demo) {
    if (mode === "empty") {
      self.saved = self.turns;
      self.turns = [];
      self.scrollY = 0;
      self.stick = false;
    } else if (self.demo === "empty") {
      self.turns = self.saved ?? [];
      self.saved = null;
    }
    self.demo = mode;
  }
  self.newTurns = 0;
  self.keyTurn = null;
  self.hoveredTurn = null;
  self.turnList = false;
  cx.notify();
}

export function cycleMode(self, cx) {
  setMode(self, self.demo === "demo" ? "offline"
    : self.demo === "offline" ? "empty" : "demo", cx);
}

export function selectTurn(self, id, cx) {
  if (!self.turns.some((turn) => turn.id === id)) return;
  const geometry = turnGeometry(self.turns, self.turnHeights);
  const target = geometry.ranges.find((r) => r.id === id);
  if (!target) return;
  // Scroll the SAME continuous transcript; do not slice away earlier turns.
  self.scrollY = clampScroll(target.start, geometry.total, self.viewportHeight);
  self.pendingJump = geometry.complete ? null : id;
  self.hoveredTurn = null;
  cx.notify();
}

export function toggleGroup(self, id, cx) {
  if (self.groupOpen.has(id)) self.groupOpen.delete(id);
  else self.groupOpen.add(id);
  cx.notify();
}

export function toggleTool(self, id, cx) {
  if (self.toolOpen.has(id)) self.toolOpen.delete(id);
  else self.toolOpen.add(id);
  cx.notify();
}

export function keyDown(self, event, cx) {
  const key = String(event?.keystroke?.key ?? "").toLowerCase();
  if (!key) return;
  if (self.asking !== null) {
    askKey(self, key, cx);
    return;
  }
  const geometry = turnGeometry(self.turns, self.turnHeights);
  const layout = railLayout(geometry.ranges, self.viewportHeight,
    visibleTurnIds(geometry.ranges, self.scrollY, self.viewportHeight));
  if (key === "escape") {
    if (self.keyTurn === null && self.hoveredTurn === null && !self.turnList) return;
    self.keyTurn = null;
    self.hoveredTurn = null;
    self.turnList = false;
    cx.notify();
    return;
  }
  if (!layout.dots.length) return;
  const current = layout.dots.findIndex((dot) => dot.turnIds.includes(self.keyTurn));
  let next = current;
  if (key === "up") next = current < 0 ? layout.dots.length - 1 : Math.max(0, current - 1);
  else if (key === "down") next = current < 0 ? 0 : Math.min(layout.dots.length - 1, current + 1);
  else if (key === "home") next = 0;
  else if (key === "end") next = layout.dots.length - 1;
  else if (key === "enter" || key === "return") {
    if (!self.keyTurn) return;
    selectTurn(self, self.keyTurn, cx);
    return;
  } else return;
  self.keyTurn = layout.dots[next].id;
  // Moving the keyboard focus moves the reading position, so the packet and
  // the transcript stay together.
  const target = geometry.ranges.find((range) => range.id === self.keyTurn);
  if (target) self.scrollY = clampScroll(target.start, geometry.total, self.viewportHeight);
  self.hoveredTurn = null;
  cx.stop_propagation();
  cx.notify();
}
