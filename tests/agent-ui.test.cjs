// Headless contract tests for the independent native GPUI preview.
// Herdr's actual visual, scroll and Markdown renderer require a running App.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");

function node() {
  const state = { nodeId: null, kids: [], handlers: {}, style: {} };
  let proxy;
  proxy = new Proxy(state, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === "id") return (id) => { target.nodeId = id; return proxy; };
      if (prop === "when") return (condition, fn) => { if (condition) fn(proxy); return proxy; };
      if (prop === "child") return (child) => { target.kids.push(child); return proxy; };
      if (prop === "children") return (children) => { target.kids.push(...children); return proxy; };
      if (String(prop).startsWith("on_")) return (...args) => { target.handlers[prop] = args.find(x => typeof x === "function"); return proxy; };
      return (...args) => { target.style[prop] = args; return proxy; };
    },
  });
  return proxy;
}
function find(root, id) {
  if (!root || typeof root !== "object") return null;
  if (root.nodeId === id) return root;
  for (const child of root.kids || []) {
    const v = find(child, id);
    if (v) return v;
  }
  return null;
}
function svgOf(n) {
  if (!n || typeof n !== "object") return null;
  if (typeof n.svg === "string") return n.svg;
  for (const child of n.kids || []) {
    const found = svgOf(child);
    if (found) return found;
  }
  return null;
}
function textOf(n) {
  if (typeof n === "string") return n;
  if (!n || typeof n !== "object") return "";
  return (n.kids || []).map(textOf).join(" ");
}
function click(tree, id) {
  const n = find(tree, id);
  assert.ok(n, "missing control " + id);
  assert.equal(typeof n.handlers.on_click, "function", "no click for " + id);
  n.handlers.on_click(null, context);
}
function stateObj(spec) {
  return {
    text: spec.value ?? "", events: {},
    on(name, fn) { this.events[name] = fn; },
    value() { return this.text; },
    set_value(value) { this.text = value; },
  };
}
function pathBuilder() {
  return { move_to() { return this; }, line_to() { return this; },
    close() { return this; }, build() { return {}; } };
}
const context = { notify() {}, stop_propagation() {}, focus_handle: () => ({ focus() {} }),
  timer: { every(ms, callback) { context.tick = callback; } },
  spawn(task) { context.task = task; } };
const box = {
  View: class {}, div: node, h_flex: node, v_flex: node,
  theme: () => ({
    foreground: "#DDD", muted: "#AAA", dim: "#777", accent: "#9AD", blocked: "#E99",
    working: "#EC9", chrome: "#222", background: "#181818", raised: "#292929",
    border: "#444", popover: "#333", input: "#555",
  }),
  TextView: { markdown: (id, source) => {
    const n = node(); n.nodeId = id; n.markdown = source;
    return n;
  } },
  TextareaState: { new: stateObj },
  appHome: () => "/tmp/apphome",
  exec: async () => ({ code: 0, stdout: "", stderr: "" }),
  readTextFile: async () => null,
  writeTextFile: async (file, text) => { box.written.push([file, text]); return null; },
  written: [],
  shared: () => null,
  watchFolder: async () => [],
  home: () => "/tmp/home",
  notify: (note) => { box.notes.push(note); },
  notes: [],
  props: () => ({ overlay: { id: "agent-ui-view" } }),
  closeOverlay: (overlay) => { box.closed.push(overlay); },
  closed: [],
  Textarea: { new: () => node() },
  svg: (file) => { const n = node(); n.svg = file; return n; },
  PathBuilder: { fill: pathBuilder },
  Background: { linear_gradient: (angle, from, to) => ({ angle, from, to }) },
  window: { paint_path: (_path, background) => { const n = node(); n.paint = background; return n; } },
};
const modelSrc = fs.readFileSync(path.join(root, "mods/agent-ui/model.js"), "utf8").replace(/^export /gm, "");
const stateSrc = fs.readFileSync(path.join(root, "mods/agent-ui/state.js"), "utf8")
  .replace(/^export /gm, "");
const fixtureSrc = fs.readFileSync(path.join(root, "mods/agent-ui/fixtures.js"), "utf8")
  .replace(/^export (const|function) /gm, "$1 ");
const bridgeSrc = fs.readFileSync(path.join(root, "mods/agent-ui/bridge-source.js"), "utf8")
  .replace(/^export /gm, "");
vm.runInNewContext(modelSrc + "\n" + stateSrc + "\n" + bridgeSrc + "\n" + fixtureSrc
  + "\nthis.summarizeActivity=summarizeActivity;this.toRailNodes=toRailNodes;this.shortPrompt=shortPrompt;this.turnGeometry=turnGeometry;this.clampScroll=clampScroll;this.visibleTurnIds=visibleTurnIds;this.railLayout=railLayout;this.dotSize=dotSize;this.railHit=railHit;this.previewTop=previewTop;this.railScrubOffset=railScrubOffset;this.FIXTURE_TURNS=FIXTURE_TURNS;this.DEMO_TURNS=DEMO_TURNS;this.fixtureSource=fixtureSource;this.applyEvent=applyEvent;this.createTranscript=createTranscript;this.createBridgeSource=createBridgeSource;this.readBridge=readBridge;this.initialBridge=initialBridge;this.SOURCE_KEY=SOURCE_KEY;", box);

assert.equal(box.FIXTURE_TURNS.length, 7);
assert.equal(box.DEMO_TURNS.length, 60, "the shipped demo ships a long history");
assert.equal(new Set(box.DEMO_TURNS.map((turn) => turn.id)).size, 60, "rail keys stay unique");
assert.equal(box.DEMO_TURNS.filter((turn) => turn.requiresUserAction).length, 2,
  "only two turns explicitly ask the user for something");
assert.equal(box.DEMO_TURNS.at(-1).status, "working", "the demo ends on an in-flight turn");
assert.equal(box.summarizeActivity([]).total, 0);
assert.deepEqual(
  [box.summarizeActivity(box.FIXTURE_TURNS[5].tools).failed, box.summarizeActivity(box.FIXTURE_TURNS[5].tools).pending],
  [1, 1],
);
assert.equal(box.toRailNodes(box.FIXTURE_TURNS).length, 7);
assert.equal(box.toRailNodes(box.FIXTURE_TURNS)[5].actionable, false,
  "failed/pending tools must not create a user-action warning");
assert.equal(box.toRailNodes(box.FIXTURE_TURNS)[0].actionable, false);
assert.equal(box.toRailNodes([{ id: "request", prompt: "Approve?", requiresUserAction: true }])[0].actionable, true,
  "user action must be explicit, never derived from a failed tool");
assert.ok(box.shortPrompt("a".repeat(120)).length <= 39);

const fifteen = Array.from({ length: 15 }, (_, i) => ({ id: `n-${i}` }));
const heights = new Map(fifteen.map(x => [x.id, 100]));
const positions = box.turnGeometry(fifteen, heights, 10, 5);
assert.equal(positions.complete, true);
assert.equal(positions.total, 1650);
assert.deepEqual(Array.from(box.visibleTurnIds(positions.ranges, 430, 480)),
  ["n-3", "n-4", "n-5", "n-6", "n-7", "n-8"],
  "every turn overlapping the viewport is highlighted, not just one active turn");
const rail = box.railLayout(positions.ranges, 340);
assert.equal(rail.pitch, 12, "a 9px dot plus a 3px gap");
assert.equal(rail.perDot, 2, "15 turns collapse into the 40% column, not 15 dots");
assert.equal(rail.dots.length, 8);
const centers = rail.dots.map((dot) => dot.center);
centers.slice(1).forEach((center, i) =>
  assert.equal(center - centers[i], 12, "dots are 3px apart"));
assert.equal(box.railHit(rail.dots, 9, centers[4]), rail.dots[4].id);
assert.equal(box.railHit(rail.dots, 0, centers[4]), null,
  "the rail margin is not a dot target");
const columnTop = centers[0] - rail.pitch / 2;
const columnBottom = centers.at(-1) + rail.pitch / 2;
assert.ok(columnTop >= 340 * 0.3 && columnBottom <= 340 * 0.7,
  "the column is vertically centred inside 40% of the view");
assert.ok(box.previewTop(columnBottom - rail.pitch, 340, true) + 52 <= 340 - 4,
  "last marker hover preview stays inside viewport");
assert.ok(box.previewTop(columnTop, 340, false) >= 4);

// The focused dot is the widest and neighbours fall away to the 6px floor.
const sizes = rail.dots.map((dot) => dot.size);
assert.equal(sizes[rail.focus], 9, "peak at the reading position");
assert.equal(sizes[0], 4, "the far end of the packet is a 4px floor dot");
assert.equal(sizes.at(-1), 4);
sizes.slice(rail.focus).slice(1).forEach((size, i) =>
  assert.ok(size <= sizes[rail.focus + i], "the packet decays away from focus"));
assert.equal(box.dotSize(3, 3, 4, 9), 9);
assert.equal(box.dotSize(9, 3, 4, 9), 4);
assert.equal(box.dotSize(4, 3, 4, 9), 7);

// A long history buckets several turns per dot instead of overflowing.
const many = Array.from({ length: 400 }, (_, i) =>
  ({ id: `m-${i}`, start: i * 100, end: i * 100 + 90 }));
const dense = box.railLayout(many, 340);
assert.equal(dense.dots.length, 11, "a 400-turn history still fits the column");
assert.equal(dense.perDot, 37);
assert.equal(dense.dots[0].turnIds.length, 37);
assert.equal(dense.dots.at(-1).id, "m-370");
assert.ok(dense.dots.at(-1).center + dense.pitch / 2 <= 340 * 0.7);
assert.equal(box.clampScroll(100000, 1650, 480), 1170);
assert.equal(box.railScrubOffset(8, 1650, 480), 0);
assert.equal(box.railScrubOffset(240, 1650, 480), 585);
assert.equal(box.railScrubOffset(480, 1650, 480), 1170);
assert.equal(box.railScrubOffset(-100, 1650, 480), 0);
assert.equal(box.railScrubOffset(200, 100, 480), 0,
  "the dot rail does not scroll content shorter than its viewport");

const src = fs.readFileSync(path.join(root, "mods/agent-ui/main.js"), "utf8");
vm.runInNewContext(src.replace(/^import\s+\{[\s\S]*?\}\s+from\s+"[^"]+";\s*/gm, "")
  .replace(/^import [^\n]+;\n/gm, "")
  .replace("export default class AgentUi", "class AgentUi")
  + "\nthis.AgentUi=AgentUi;", box);
const ui = new box.AgentUi();
ui.init({}, context);
ui.turns = box.FIXTURE_TURNS.map((turn) => ({
  ...turn, messages: [...turn.messages], tools: [...turn.tools],
}));
let tree = ui.render(context);
assert.ok(find(tree, "agent-ui-root"));
assert.ok(find(tree, "agent-ui-composer"));
assert.ok(find(tree, "agent-ui-rail"));
assert.ok(find(tree, "agent-ui-rail-marker-t-inspect"));
assert.equal(find(tree, "agent-ui-rail").style.w[0], 18);
assert.deepEqual(Array.from(find(tree, "agent-ui-rail-marker-t-inspect").style.justify_end), [],
  "dots are right-aligned in the strip");
assert.equal(find(tree, "agent-ui-rail-marker-t-inspect").style.pr[0], 3,
  "dots keep a 3px inset from the right edge");
assert.equal(find(tree, "agent-ui-scrollbar"), null);
assert.equal(find(tree, "agent-ui-scrollbar-track"), null,
  "dots replace the visual scrollbar track");
assert.equal(find(tree, "agent-ui-scrollbar-thumb"), null,
  "dots replace the visual scrollbar thumb");
assert.equal(find(tree, "agent-ui-rail-marker-t-inspect").style.left[0], 0,
  "all dots share the same 18px rail centerline");
assert.equal(find(tree, "agent-ui-rail-window"), null,
  "rail is made of circles, not a separate vertical range bar");
assert.equal(find(tree, "agent-ui-root").style.rounded[0], 10,
  "Stack view follows Herdr main-layout corner radius");
assert.deepEqual(Array.from(find(tree, "agent-ui-root").style.border_1), [],
  "Stack view has a subtle native-style one-pixel border");
assert.equal(find(tree, "agent-ui-root").style.border_color[0], "#444",
  "Stack view uses theme border rather than a hard-coded color");
assert.ok(find(tree, "agent-ui-root").style.overflow_hidden,
  "rounded workspace clips child content");
assert.equal(find(tree, "agent-ui-header").style.h[0], 38,
  "header is aligned with Herdr's 38px Terminal-style chrome");
const closeView = find(tree, "agent-ui-close");
assert.ok(closeView, "an overlay view offers a way out");
assert.equal(svgOf(closeView.kids[0]), "mods/agent-ui/icons/x.svg",
  "the close control is the x icon, not a glyph");
closeView.handlers.on_click({}, context);
assert.deepEqual(box.closed, [{ id: "agent-ui-view" }],
  "the close control closes the overlay it was opened in");
const inactiveDot = find(tree, "agent-ui-rail-marker-t-live").kids[0];
assert.equal(inactiveDot.style.size[0], 4, "a dot away from the focus sits at the 4px floor");
assert.equal(inactiveDot.style.opacity[0], 0.7, "dots are drawn at 70% opacity");
assert.equal(inactiveDot.style.rounded[0], 999, "pin is circular, not a line");
assert.equal(find(tree, "agent-ui-rail-preview"), null);
assert.equal(find(tree, "agent-ui-scenes"), null);
assert.equal(find(tree, "agent-ui-search"), null);
assert.equal(find(tree, "agent-ui-group-list-t-inspect"), null, "groups default collapsed");
assert.ok(find(tree, "agent-ui-group-trigger-t-inspect"));
assert.equal(find(tree, "agent-ui-tool-i-read"), null, "no individual cards before group expansion");

// Correctly feeds original Markdown to Herdr's documented native Markdown API.
const markdown = find(tree, "agent-ui-message-a-intro-md");
assert.ok(markdown, "native Markdown node exists");
assert.match(markdown.markdown, /## 設計原則/);
assert.match(markdown.markdown, /\*\*同一個 Pi runtime\*\*/);

click(tree, "agent-ui-group-trigger-t-inspect");
tree = ui.render(context);
assert.ok(find(tree, "agent-ui-group-list-t-inspect"));
assert.ok(find(tree, "agent-ui-tool-i-read"));
assert.equal(find(tree, "agent-ui-detail-i-read"), null, "detail stays closed");
click(tree, "agent-ui-tool-trigger-i-read");
assert.ok(find(ui.render(context), "agent-ui-detail-i-read"), "typed detail expands on demand");
click(ui.render(context), "agent-ui-tool-trigger-i-read");
assert.equal(find(ui.render(context), "agent-ui-detail-i-read"), null);

// The collapsed group has only chevron + summary; no separate right status.
const collapsed = find(ui.render(context), "agent-ui-group-trigger-t-failure");
assert.equal(collapsed.kids.length, 2);
assert.match(textOf(collapsed), /1 failed/);
assert.doesNotMatch(textOf(collapsed), /Needs attention/);

// Fake actual GPUI height reports; a scroll reflects ALL visible turns.
ui.measureViewport({ height: 360 }, context);
const measured = [230, 235, 210, 260, 190, 245, 210];
ui.turns.forEach((turn, i) => ui.measureTurn(turn.id, { height: measured[i] }, context));
assert.equal(ui.turnHeights.size, 7);
const oldTree = ui.render(context);
assert.ok(find(oldTree, "agent-ui-user-t-intro"));
assert.ok(find(oldTree, "agent-ui-user-t-live"), "continuous transcript remains fully mounted");
const oldY = ui.scrollY;
find(oldTree, "agent-ui-main").handlers.on_scroll_wheel({ delta: { y: -380 } }, context);
assert.equal(ui.scrollY, oldY + 380);
assert.equal(find(ui.render(context), "agent-ui-scrollbar-track"), null);
assert.equal(find(ui.render(context), "agent-ui-scrollbar-thumb"), null);

// Blank rail area scrubs the entire transcript. No track or thumb exists.
const g = box.turnGeometry(ui.turns, ui.turnHeights);
const railDots = box.railLayout(g.ranges, ui.viewportHeight,
  box.visibleTurnIds(g.ranges, ui.scrollY, ui.viewportHeight)).dots;
const blankY = Array.from({length: ui.viewportHeight - 30}, (_, i) => i + 15)
  .find(y => box.railHit(railDots, 9, y) === null);
assert.ok(Number.isFinite(blankY), "the rail above and below the column scrubs");
const blankPress = {local_position: {x: 9, y: blankY},
  position: {x: 209, y: 1000 + blankY}, bounds: {x: 200, y: 1000}};
find(ui.render(context), "agent-ui-rail").handlers.on_mouse_down(blankPress, context);
assert.equal(ui.railGesture?.mode, "scrub");
assert.equal(ui.scrollY, box.railScrubOffset(blankY, g.total, ui.viewportHeight),
  "pressing between dots scrolls to proportional position");
find(ui.render(context), "agent-ui-main").handlers.on_mouse_move({
  position: {y: 1000 + ui.viewportHeight + 300},
}, context);
assert.equal(ui.scrollY, g.total - ui.viewportHeight, "dragging down scrubs to the end");
find(ui.render(context), "agent-ui-main").handlers.on_mouse_move({
  position: {y: 800},
}, context);
assert.equal(ui.scrollY, 0, "dragging up scrubs to the beginning");
find(ui.render(context), "agent-ui-main").handlers.on_mouse_up({}, context);
assert.equal(ui.railGesture, null, "release ends the rail scrub");
find(ui.render(context), "agent-ui-main").handlers.on_scroll_wheel({delta: {y: -380}}, context);
assert.equal(ui.scrollY, 380, "wheel still updates the same transcript scrollY");

// Dot press is a jump on release; dragging a dot turns into rail scrubbing.
const sharedPin = railDots.find((dot) => dot.turnIds.includes("t-rail"));
const sharedY = sharedPin.center;
const pinPress = {local_position: {x: 9, y: sharedY},
  position: {x: 209, y: 1000 + sharedY}, bounds: {x: 200, y: 1000}};
const initialPinScroll = ui.scrollY;
find(ui.render(context), "agent-ui-rail").handlers.on_mouse_down(pinPress, context);
assert.equal(ui.railGesture?.mode, "pin");
find(ui.render(context), "agent-ui-main").handlers.on_mouse_move({
  position: {y: pinPress.position.y + 3},
}, context);
assert.equal(ui.scrollY, initialPinScroll,
  "less than 5px is still a potential dot click");
find(ui.render(context), "agent-ui-main").handlers.on_mouse_move({
  position: {y: pinPress.position.y + 70},
}, context);
assert.equal(ui.railGesture?.mode, "scrub");
assert.ok(Math.abs(ui.scrollY - box.railScrubOffset(sharedY + 70, g.total, ui.viewportHeight)) < 1e-8,
  "dragging a dot scrubs by its pointer position");
const afterDrag = ui.scrollY;
find(ui.render(context), "agent-ui-rail").handlers.on_mouse_up(pinPress, context);
assert.equal(ui.railGesture, null);
assert.equal(ui.scrollY, afterDrag, "drag release does not also jump to the dot");
const scrolled = ui.render(context);
const visible = box.visibleTurnIds(
  box.turnGeometry(ui.turns, ui.turnHeights).ranges, ui.scrollY, ui.viewportHeight);
assert.ok(visible.length >= 2, "viewport contains multiple visible turns");
const layoutNow = box.railLayout(
  box.turnGeometry(ui.turns, ui.turnHeights).ranges, ui.viewportHeight, visible);
layoutNow.dots.forEach((dot) => {
  const pin = find(scrolled, `agent-ui-rail-marker-${dot.id}`).kids[0];
  assert.equal(pin.style.size[0], dot.size, "dot width comes from the focus packet");
  assert.equal(pin.style.rounded[0], 999);
});
assert.equal(Math.max(...layoutNow.dots.map((dot) => dot.size)),
  layoutNow.dots[layoutNow.focus].size, "one dot owns the peak");
assert.ok(layoutNow.dots.filter((dot) => dot.visible).length >= 2,
  "every visible turn is part of the packet");
const outside = ui.turns.find(turn => !visible.includes(turn.id));
assert.ok(outside, "fixture contains turns outside viewport");
const outsideDot = layoutNow.dots.find((dot) => dot.turnIds.includes(outside.id));
const outsidePin = find(scrolled, `agent-ui-rail-marker-${outsideDot.id}`).kids[0];
assert.equal(outsidePin.style.size[0], outsideDot.size);
assert.equal(outsidePin.style.bg[0], "#777",
  "outside turns use neutral theme dim, never tool status");
assert.ok(ui.scrollY > 0);

ui.selectTurn("t-failure", context);
tree = ui.render(context);
assert.ok(find(tree, "agent-ui-transcript"), "one permanent transcript scrolled by offset");
assert.ok(find(tree, "agent-ui-user-t-inspect"), "jump must not delete preceding turns");
assert.ok(find(tree, "agent-ui-user-t-failure"));
assert.equal(ui.pendingJump, null, "measured positions navigate immediately");
assert.ok(ui.scrollY > 0);
assert.equal(find(tree, "agent-ui-group-list-t-failure"), null, "failed group remains collapsed");
assert.match(textOf(find(tree, "agent-ui-group-trigger-t-failure")), /1 failed/, "error visible in collapsed summary");

function mergedEventFor(id) {
  const g = box.turnGeometry(ui.turns, ui.turnHeights);
  const dot = box.railLayout(g.ranges, ui.viewportHeight,
    box.visibleTurnIds(g.ranges, ui.scrollY, ui.viewportHeight))
    .dots.find((x) => x.turnIds.includes(id));
  assert.ok(dot, "missing dot position for " + id);
  const y = dot.center;
  return {
    local_position: { x: 9, y },
    position: { x: 209, y: 1000 + y },
    bounds: { x: 200, y: 1000 },
  };
}
function moveToPin(id) {
  find(ui.render(context), "agent-ui-rail").handlers.on_mouse_move(mergedEventFor(id), context);
}
function tapPin(id) {
  const event = mergedEventFor(id);
  const rail = find(ui.render(context), "agent-ui-rail");
  const before = ui.scrollY;
  rail.handlers.on_mouse_down(event, context);
  assert.equal(ui.scrollY, before, "a dot press does not jump until released");
  find(ui.render(context), "agent-ui-rail").handlers.on_mouse_up(event, context);
}
assert.ok(find(tree, "agent-ui-rail-marker-t-rail"));
moveToPin("t-rail");
tree = ui.render(context);
const preview = find(tree, "agent-ui-rail-preview");
assert.ok(preview, "hover shows compact preview");
assert.match(textOf(preview), /右側 Message Rail/);
assert.doesNotMatch(textOf(preview), /Read \d|Run \d|Pi:|13:42|工具數量/, "no busy metadata in preview");
find(tree, "agent-ui-rail").handlers.on_hover(false, context);
assert.equal(find(ui.render(context), "agent-ui-rail-preview"), null, "hover exit removes preview");
moveToPin("t-failure");
const failurePreview = find(ui.render(context), "agent-ui-rail-preview");
assert.doesNotMatch(textOf(failurePreview), /Needs you/,
  "a failed tool is NOT an actionable approval request");
const originalPinColor = find(ui.render(context), "agent-ui-rail-marker-t-failure").kids[0].style.bg[0];
ui.turns[5].requiresUserAction = true;
let actionPreview = find(ui.render(context), "agent-ui-rail-preview");
assert.match(textOf(actionPreview), /Needs you/,
  "explicit user action can create a second hover line");
assert.ok(actionPreview.style.top[0] >= 4 &&
  actionPreview.style.top[0] + 52 <= ui.viewportHeight - 4,
  "hover preview is clamped even for a marker close to the bottom");
assert.equal(find(ui.render(context), "agent-ui-rail-marker-t-failure").kids[0].style.bg[0],
  originalPinColor, "user-action/tool state must not recolor rail pins");
moveToPin("t-live");
assert.ok(find(ui.render(context), "agent-ui-rail-preview").style.top[0] + 36
  <= ui.viewportHeight - 4, "last pin hover stays within bounds");
tapPin("t-rail");
assert.equal(ui.scrollY, box.clampScroll(
  box.turnGeometry(ui.turns, ui.turnHeights).ranges.find(x => x.id === "t-rail").start,
  box.turnGeometry(ui.turns, ui.turnHeights).total, ui.viewportHeight),
  "click scrolls to measured turn location in the same transcript");
assert.equal(ui.hoveredTurn, null);
assert.equal(find(ui.render(context), "agent-ui-scrollbar-thumb"), null,
  "dot click changes scrollY without drawing any thumb");
const anchorBefore = ui.scrollY;
ui.measureTurn("t-intro", { height: measured[0] + 55 }, context);
assert.equal(ui.scrollY, anchorBefore + 55,
  "expanding a prior turn preserves the user's current reading anchor");
ui.measureViewport({ height: 48 }, context);
assert.equal(find(ui.render(context), "agent-ui-rail"), null,
  "very short view hides dots instead of exposing an invisible scrollbar");
ui.measureViewport({ height: 360 }, context);
assert.ok(find(ui.render(context), "agent-ui-rail-marker-t-intro"),
  "dots return after resizing");
ui.measureViewport({ height: 10000 }, context);
assert.ok(find(ui.render(context), "agent-ui-rail-marker-t-intro"),
  "dots remain visible even when there is no content to scroll");
assert.equal(find(ui.render(context), "agent-ui-scrollbar-thumb"), null);
assert.equal(find(ui.render(context), "agent-ui-scrollbar-track"), null);
ui.measureViewport({ height: 360 }, context);

ui.composer.set_value("本地測試訊息");
click(ui.render(context), "agent-ui-send");
assert.equal(ui.turns.length, 8);
assert.equal(ui.composer.value(), "");
assert.ok(find(ui.render(context), "agent-ui-user-t-local-1"));
assert.match(find(ui.render(context), "agent-ui-message-a-local-1-md").markdown, /Local preview only/);

ui.changeSize({ width: 420 }, context);
assert.ok(find(ui.render(context), "agent-ui-rail"),
  "narrow mode uses the same dots-only scrollbar");
assert.ok(find(ui.render(context), "agent-ui-rail-marker-t-intro"),
  "dots are still usable in a narrow pane");
ui.changeSize({ width: 210 }, context);
assert.equal(find(ui.render(context), "agent-ui-rail-preview"), null,
  "extremely narrow panes do not overflow with a hover preview");

// The shipped demo is a full-length conversation: 60 turns must still fit.
ui.turns = box.DEMO_TURNS.map((turn) => ({
  ...turn, messages: [...turn.messages], tools: [...turn.tools],
}));
ui.turnHeights = new Map();
ui.scrollY = 0;
ui.changeSize({ width: 800 }, context);
ui.measureViewport({ height: 460 }, context);
const longGeometry = box.turnGeometry(ui.turns, ui.turnHeights);
const longRail = box.railLayout(longGeometry.ranges, ui.viewportHeight,
  box.visibleTurnIds(longGeometry.ranges, ui.scrollY, ui.viewportHeight));
assert.equal(longRail.dots.length, 15, "60 turns collapse into 15 dots at 460px");
assert.equal(longRail.perDot, 4);
assert.ok(longRail.dots.length * longRail.pitch <= ui.viewportHeight * 0.4,
  "the long-history column still respects the 40% bound");
const longRender = ui.render(context);
assert.ok(find(longRender, "agent-ui-rail"));
assert.ok(find(longRender, `agent-ui-rail-marker-${longRail.dots.at(-1).id}`),
  "the last bucket is reachable");
assert.ok(find(longRender, "agent-ui-user-t-long-01"), "generated turns are mounted");

// Keyboard reaches the rail without a pointer. Screen readers are NOT claimed:
// Herdr exposes no accessibility API, so only focus + keys are testable here.
ui.turns = box.FIXTURE_TURNS.map((turn) => ({
  ...turn, messages: [...turn.messages], tools: [...turn.tools],
}));
ui.turnHeights = new Map();
ui.changeSize({ width: 800 }, context);
ui.measureViewport({ height: 460 }, context);
ui.scrollY = 0;
ui.keyTurn = null;
const keyEvent = (key) => ({ keystroke: { key } });
let rootNode = find(ui.render(context), "agent-ui-root");
assert.ok(rootNode.handlers.on_key_down, "the Stack view handles keys while focused");
assert.equal(rootNode.style.track_focus.length, 1,
  "the root tracks the focus handle taken in init");
assert.equal(typeof rootNode.style.track_focus[0].focus, "function");
rootNode.handlers.on_key_down(keyEvent("down"), context);
assert.ok(ui.keyTurn, "arrow down selects the first rail dot");
rootNode = find(ui.render(context), "agent-ui-root");
const keyedDot = find(ui.render(context),
  `agent-ui-rail-marker-${ui.keyTurn}`).kids[0];
assert.equal(keyedDot.style.opacity[0], 1, "keyboard focus is drawn solid");
assert.equal(keyedDot.style.bg[0], "#9AD", "keyboard focus uses the accent token");
const keyPreview = find(ui.render(context), "agent-ui-rail-preview");
assert.ok(keyPreview, "focused dots show the same preview as hover");
const kbGeometry = () => box.turnGeometry(ui.turns, ui.turnHeights);
rootNode.handlers.on_key_down(keyEvent("home"), context);
assert.equal(ui.scrollY, kbGeometry().ranges[0].start, "Home jumps to the first turn");
rootNode.handlers.on_key_down(keyEvent("down"), context);
const focusedId = ui.keyTurn;
const focusedStart = kbGeometry().ranges.find((range) => range.id === focusedId).start;
rootNode.handlers.on_key_down(keyEvent("enter"), context);
assert.equal(ui.scrollY, focusedStart, "Enter jumps to the focused turn");
rootNode.handlers.on_key_down(keyEvent("end"), context);
const endTurn = ui.keyTurn;
assert.equal(endTurn, kbGeometry().ranges.at(-1).id, "End reaches the last bucket");
rootNode.handlers.on_key_down(keyEvent("up"), context);
assert.notEqual(ui.keyTurn, endTurn, "arrow up moves back");
rootNode.handlers.on_key_down(keyEvent("down"), context);
assert.equal(ui.keyTurn, endTurn, "arrow down returns");
rootNode.handlers.on_key_down(keyEvent("escape"), context);
assert.equal(ui.keyTurn, null, "Escape clears the keyboard focus");
assert.equal(find(ui.render(context), "agent-ui-rail-preview"), null);

// A narrow pane swaps the strip for the same buckets as a short list.
ui.changeSize({ width: 210 }, context);
let narrow = ui.render(context);
assert.equal(find(narrow, "agent-ui-rail"), null, "no strip in a narrow pane");
assert.ok(find(narrow, "agent-ui-turn-list-toggle"), "a Turns control takes over");
find(narrow, "agent-ui-turn-list-toggle").handlers.on_click({}, context);
narrow = ui.render(context);
assert.ok(find(narrow, "agent-ui-turn-list"), "the list opens in place");
const listGeometry = box.turnGeometry(ui.turns, ui.turnHeights);
const listLayout = box.railLayout(listGeometry.ranges, ui.viewportHeight,
  box.visibleTurnIds(listGeometry.ranges, ui.scrollY, ui.viewportHeight));
const listRowId = listLayout.dots[0].id;
assert.ok(find(narrow, `agent-ui-turn-list-${listRowId}`), "every bucket has a row");
const listScroll = ui.scrollY;
find(narrow, `agent-ui-turn-list-${listRowId}`).handlers.on_click({}, context);
assert.equal(ui.turnList, false, "picking a row closes the list");
assert.notEqual(ui.scrollY, listScroll, "picking a row jumps");
ui.changeSize({ width: 800 }, context);

// Tool details: an unknown kind is shown as itself, truncated output says how
// much it dropped, and a partial patch is not passed off as a full one.
ui.turns.push({
  id: "t-detail-edge", prompt: "edge cases", status: "done",
  messages: [{ id: "a-detail-edge", role: "assistant", text: "edge" }],
  tools: [
    { id: "x-output", kind: "exec", title: "Run", status: "done", target: "cmd",
      detail: Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n") },
    { id: "x-unknown", kind: "weird-kind", title: "Mystery", status: "done", target: "?",
      detail: "raw payload" },
    { id: "x-partial", kind: "edit", title: "Edit", status: "done", target: "f.js",
      detail: "- only a removal" },
  ],
});
ui.turnHeights = new Map();
ui.groupOpen.add("t-detail-edge");
ui.toolOpen.add("x-output");
ui.toolOpen.add("x-unknown");
ui.toolOpen.add("x-partial");
const edge = ui.render(context);
assert.equal(find(edge, "agent-ui-detail-more-x-output").kids[0].text ?? "",
  "", "truncation notice node exists");
const moreText = textOf(find(edge, "agent-ui-detail-more-x-output"));
assert.match(moreText, /18 of 40 lines/);
assert.match(moreText, /full output stays in the Terminal/);
assert.match(textOf(find(edge, "agent-ui-tool-x-unknown")), /WEIRD-KIND/,
  "an unknown tool kind is not relabelled as a known one");
assert.ok(find(edge, "agent-ui-detail-partial-x-partial"),
  "a patch without a hunk header is marked partial");
assert.equal(find(edge, "agent-ui-detail-partial-x-unknown"), null,
  "only edit details carry the partial-patch notice");

// Empty and offline are states, not missing renders: the chip cycles them.
const demoChip = () => find(ui.render(context), "agent-ui-demo-state");
assert.equal(textOf(demoChip()), "DEMO");
demoChip().handlers.on_click({}, context);
let offline = ui.render(context);
assert.ok(find(offline, "agent-ui-offline"), "offline shows a banner");
assert.match(textOf(find(offline, "agent-ui-offline")), /bridge offline/i);
assert.equal(find(offline, "agent-ui-send").handlers.on_click, undefined,
  "sending is disabled while the bridge is offline");
assert.equal(find(offline, "agent-ui-transcript") !== null, true,
  "the last known turns stay readable offline");
const offlineCount = ui.turns.length;
ui.composer.set_value("hello");
ui.notice = "";
ui.send(context);
assert.equal(ui.turns.length, offlineCount, "offline send does not append");
assert.match(ui.notice, /offline · nothing was sent/i);
ui.composer.set_value("");
demoChip().handlers.on_click({}, context);
const empty = ui.render(context);
assert.ok(find(empty, "agent-ui-empty"), "empty state replaces the transcript");
assert.equal(find(empty, "agent-ui-transcript"), null);
assert.equal(find(empty, "agent-ui-rail-marker-0"), null, "no markers with no turns");
assert.equal(find(empty, "agent-ui-send").handlers.on_click, undefined);
find(empty, "agent-ui-empty-restore").handlers.on_click({}, context);
assert.equal(ui.turns.length, offlineCount, "demo turns come back");
assert.equal(find(ui.render(context), "agent-ui-empty"), null);

// A turn that arrives while the reader is above does not move the transcript.
ui.changeSize({ width: 800 }, context);
ui.measureViewport({ height: 460 }, context);
ui.scrollY = 0;
ui.render(context);
assert.equal(ui.stick, false, "the top of a long transcript is not sticky");
const readingY = ui.scrollY;
ui.demoAppend(context);
assert.equal(ui.newTurns, 1, "an unnoticed turn is counted");
assert.equal(ui.scrollY, readingY, "the reading anchor is preserved");
const pill = find(ui.render(context), "agent-ui-new-turns-pill");
assert.match(textOf(pill), /1 new/);
pill.handlers.on_click({}, context);
assert.equal(ui.newTurns, 0, "jumping clears the counter");
const bottomY = box.turnGeometry(ui.turns, ui.turnHeights).total - ui.viewportHeight;
assert.equal(ui.scrollY, bottomY, "the pill lands at the bottom");
assert.equal(ui.stick, true, "the bottom is sticky");

// At the bottom, growth follows; that is the whole difference.
ui.demoAppend(context);
ui.render(context);
assert.equal(ui.newTurns, 0, "a following reader is not told about new turns");
assert.ok(ui.scrollY > bottomY, "a following reader moves with the content");
assert.equal(find(ui.render(context), "agent-ui-new-turns-pill"), null);

// A stream arrives in pieces through the same appendTurn() path a bridge uses.
ui.changeSize({ width: 800 }, context);
ui.measureViewport({ height: 460 }, context);
ui.jumpToBottom(context);
ui.scrollY = 0;
ui.render(context);
assert.equal(typeof context.tick, "function", "init registers the only tick Mods have");
const streamCount = ui.turns.length;
find(ui.render(context), "agent-ui-stream").handlers.on_click({}, context);
assert.equal(ui.turns.length, streamCount + 1, "replay appends a working turn");
assert.equal(ui.source.streaming(), true, "the source reports a live stream");
const streamId = ui.turns.at(-1).id;
const streamed = () => ui.turns.find((turn) => turn.id === streamId);
assert.equal(streamed().status, "working");
assert.equal(textOf(find(ui.render(context), "agent-ui-stream")).trim(), "finish");
assert.equal(svgOf(find(ui.render(context), "agent-ui-stream")),
  "mods/agent-ui/icons/square.svg", "a running stream offers stop, drawn as an icon");
for (let i = 0; i < 4; i += 1) context.tick(context);
assert.ok(streamed().messages[0].text.length > 0, "chunks land in the message");
assert.equal(ui.scrollY, 0, "a stream never yanks a reader who is above");
assert.equal(ui.live, 4, "arrivals are counted while reading above");
assert.match(textOf(find(ui.render(context), "agent-ui-new-turns-pill")), /live/);
const streamGeometry = box.turnGeometry(ui.turns, ui.turnHeights);
assert.equal(streamGeometry.ranges.at(-1).id, streamId,
  "the rail geometry includes the streaming turn");
assert.ok(find(ui.render(context), `agent-ui-turn-${streamId}`), "the turn renders while streaming");
find(ui.render(context), "agent-ui-stream").handlers.on_click({}, context);
assert.equal(ui.source.streaming(), false, "finish closes the stream");
assert.equal(streamed().status, "done");
const finalText = streamed().messages[0].text;
const liveAfterFinish = ui.live;
assert.ok(finalText.length > 0);
context.tick(context);
assert.equal(streamed().messages[0].text, finalText, "a finished stream ignores later ticks");
assert.equal(ui.live, liveAfterFinish, "no tick after the end changes the counter");

// At the bottom, the same stream follows instead of counting.
ui.jumpToBottom(context);
assert.equal(ui.live, 0, "jumping clears the live counter");
find(ui.render(context), "agent-ui-stream").handlers.on_click({}, context);
context.tick(context);
context.tick(context);
assert.equal(ui.live, 0, "a following reader is not told about arrivals");
assert.equal(ui.stick, true, "the reader stays stuck to the bottom");
assert.equal(find(ui.render(context), "agent-ui-new-turns-pill"), null);
ui.source.finish();
ui.pump(context);
assert.equal(ui.source.streaming(), false);
assert.equal(ui.turns.at(-1).status, "done");

// The rail needs the turn order only: no heights, no measurement.
const idOnly = box.railLayout(["a", "b", "c"], 340);
assert.deepEqual(Array.from(idOnly.dots, (dot) => dot.id), ["a", "b", "c"],
  "the rail lays out ids without waiting for any measured height");

// A bounded transcript keeps the reading position when the oldest turn falls off.
const bounded = new box.AgentUi();
bounded.init({}, context);
bounded.transcript = box.createTranscript(Array.from({ length: 5 }, (_, i) =>
  ({ id: `b-${i}`, prompt: `${i}`, status: "done",
    messages: [{ id: `a-${i}`, role: "assistant", text: "x", open: false }], tools: [] })), 5);
bounded.turnHeights = new Map(bounded.turns.map((turn) => [turn.id, 100]));
bounded.measureViewport({ height: 200 }, context);
bounded.scrollY = 120;
bounded.stick = false;
const topBefore = box.visibleTurnIds(
  box.turnGeometry(bounded.turns, bounded.turnHeights).ranges, bounded.scrollY, bounded.viewportHeight)[0];
assert.equal(topBefore, "b-1");
bounded.apply({ type: "turn.start", turn: { id: "b-5", prompt: "new" } });
assert.deepEqual(Array.from(bounded.turns, (turn) => turn.id), ["b-1", "b-2", "b-3", "b-4", "b-5"],
  "the oldest turn fell off and the new one is in");
assert.equal(bounded.turnHeights.has("b-0"), false, "heights of a dropped turn are forgotten");
assert.equal(box.visibleTurnIds(
  box.turnGeometry(bounded.turns, bounded.turnHeights).ranges, bounded.scrollY, bounded.viewportHeight)[0],
  topBefore, "the turn that was on top stays on top after the trim");

const bridgeTurn = { id: "t-b1", prompt: "read the bridge", status: "working",
  messages: [{ id: "a-b1", role: "assistant", text: "so far", open: true }],
  tools: [{ id: "c-b1", kind: "exec", title: "bash", target: "npm test", status: "running", detail: "" }] };
const files = {
  "/tmp/apphome/agent-ui/bridge/4242/meta.json": JSON.stringify({ version: 2, epoch: "e-bridge",
    revision: 9, pid: 4242, sessionId: "s-bridge", cwd: "/tmp/project" }),
  "/tmp/apphome/agent-ui/bridge/4242/done.json": JSON.stringify({ version: 2, epoch: "e-bridge",
    revision: 8, turns: [{ id: "t-b0", prompt: "earlier", status: "done",
      messages: [{ id: "a-b0", role: "assistant", text: "done", open: false }], tools: [] }] }),
  "/tmp/apphome/agent-ui/bridge/4242/live.json": JSON.stringify({ version: 2, epoch: "e-bridge",
    revision: 9, turn: bridgeTurn }),
};
let watched = 0;
box.shared = (key) => (key === box.SOURCE_KEY ? "bridge" : null);
box.exec = async (command, args) => {
  assert.equal(command, "ls");
  assert.deepEqual(Array.from(args), ["-1t", "/tmp/apphome/agent-ui/bridge"]);
  return { code: 0, stdout: "4242\n", stderr: "" };
};
box.readTextFile = async (file) => files[file] ?? null;
box.watchFolder = async () => {
  watched += 1;
  if (watched > 1) throw new Error("teardown");
  return [];
};
const bridged = new box.AgentUi();
const bridgeContext = { ...context, spawn(task) { bridgeContext.task = task; } };
bridged.init({}, bridgeContext);
assert.ok(bridged.bridge, "a layout that asks for the bridge gets the bridge source");
assert.equal(bridged.turns.length, 60, "the demo stays visible until the first read lands");
assert.equal(typeof bridgeContext.task, "function", "the bridge runs on cx.spawn, not a timer");

(async () => {
  await bridgeContext.task(bridgeContext);
  assert.equal(bridged.source.health, "live");
  assert.equal(watched, 2, "the loop waits on watchFolder after each read");
  assert.deepEqual(Array.from(bridged.turns, (turn) => [turn.id, turn.status]),
    [["t-b0", "done"], ["t-b1", "working"]], "the transcript is the snapshot plus the turn in flight");
  assert.equal(bridged.turns[1].messages[0].text, "so far", "the in-flight turn arrives with its text");
  assert.equal(bridged.turns[1].tools[0].status, "running");

  assert.equal(box.formatUsage(box.turnUsage({ messages: [{ usage: { input: 100, output: 40, cacheRead: 900, total: 1040, cost: 0.0123 } }] })),
    "1.0k tok · $0.0123", "a turn sums its message usage");
  assert.equal(box.formatUsage(box.turnUsage({ messages: [] })), "",
    "no usage renders nothing rather than zeros");
  assert.equal(box.turnUsage({ messages: [{ usage: { total: 5 } }, { usage: null }] }).total, 5);

  const markerTree = ui.render(context);
  const fade = find(markerTree, "agent-ui-bottom-fade");
  assert.deepEqual([fade.paint.angle, fade.paint.from, fade.paint.to],
    [180, "#18181800", "#18181888"], "transcript softens above the composer without hiding the last line");
  assert.equal(find(markerTree, "agent-ui-composer-wrap").style.bg, undefined,
    "the floating composer has no opaque full-width strip");
  assert.equal(find(markerTree, "agent-ui-composer-wrap").style.border_t, undefined,
    "the composer transition is not a horizontal rule");
  assert.ok(find(markerTree, "agent-ui-composer").style.shadow_sm,
    "the single rounded card has a native soft shadow");
  const darkTheme = box.theme;
  box.theme = () => ({ ...darkTheme(), background: "#ffffff", chrome: "#f8f8f8",
    foreground: "#202020", border: "#e4e4e4" });
  const lightTree = ui.render(context);
  assert.deepEqual([find(lightTree, "agent-ui-bottom-fade").paint.from,
    find(lightTree, "agent-ui-bottom-fade").paint.to],
    ["#ffffff00", "#ffffff88"], "light themes fade into their own surface");
  assert.equal(find(lightTree, "agent-ui-composer").style.bg[0], "#ffffff");
  box.theme = darkTheme;
  ui.turns = [...ui.turns, { id: "m-1", kind: "marker", prompt: "Context compacted",
    status: "done", messages: [], tools: [] }];
  const withMarker = ui.render(context);
  assert.ok(find(withMarker, "agent-ui-turn-m-1"), "a compaction boundary is a visible row");
  assert.equal(box.toRailNodes(ui.turns).some((node) => node.id === "m-1"), false,
    "a divider is not a navigation target");
  assert.ok(markerTree, "the render before the marker still had turns");

  const counted = { id: "t-usage", prompt: "how much did that cost", status: "done",
    messages: [{ id: "a-usage", role: "assistant", text: "a lot", open: false,
      usage: { input: 900, output: 300, cacheRead: 0, total: 1200, cost: 0.0042 } }], tools: [] };
  ui.turns = [counted];
  const usageTree = ui.render(context);
  assert.equal(textOf(find(usageTree, "agent-ui-usage-t-usage")), "1.2k tok · $0.0042");

  box.notes.length = 0;
  bridged.turns = [];
  const openAsk = { heading: null, questions: [{ index: 0, total: 1,
    question: "which db?", allowMultiple: false, allowFreeform: true,
    options: [{ title: "postgres", description: "Remote database" },
      { title: "sqlite", description: "Local database" }] }] };
  bridged.apply({ type: "asking", asking: openAsk });
  assert.deepEqual(box.notes.map((note) => note.title), ["Pi is asking"],
    "the plugin's open question is what raises a notification");
  const panel = bridged.render(context);
  assert.ok(find(panel, "agent-ui-ask"), "the question takes the composer's slot");
  assert.ok(find(panel, "agent-ui-ask-0-1"), "each option is its own row");
  assert.ok(textOf(find(panel, "agent-ui-ask-0-1")).includes("Local database"),
    "the option description sits below its title, not in the footer");
  assert.equal(find(panel, "agent-ui-ask-0-1").style.min_h[0], 68,
    "descriptions get enough space without clipping longer wrapped text");
  find(panel, "agent-ui-ask-0-1").handlers.on_hover(true, context);
  assert.equal(find(bridged.render(context), "agent-ui-ask-0-1").style.bg[0], "#292929",
    "a hovered row gets the same soft highlight as keyboard focus");
  const shell = find(bridged.render(context), "agent-ui-composer");
  assert.equal(shell.kids.length, 2, "the composer holds its input area and one footer");
  assert.equal(shell.kids[0].nodeId, "agent-ui-ask",
    "the question occupies the slot the textarea occupies, with no card around it");
  assert.equal(shell.style.rounded[0], find(ui.render(context), "agent-ui-composer").style.rounded[0],
    "asking and typing use the same rounded shell");
  assert.equal(find(panel, "agent-ui-ask").style.border_1, undefined,
    "do not nest another framed card inside the composer");
  assert.equal(svgOf(find(panel, "agent-ui-ask-cancel")),
    "mods/agent-ui/icons/x.svg", "a visible close action is in the question heading");
  bridged.apply({ type: "asking", asking: openAsk });
  assert.equal(box.notes.length, 1, "the same question is not announced twice");

  bridged.bridge = { dir: "/bridge/9" };
  bridged.pickAnswer(0, "sqlite", context);
  await context.task();
  assert.equal(bridged.asking, null, "answering closes the panel at once");
  assert.deepEqual(box.written.at(-1), ["/bridge/9/answer.json",
    JSON.stringify({ response: { kind: "selection", selections: ["sqlite"] } })],
    "the click becomes the one file the bridge hands back to the plugin");
  assert.equal(find(bridged.render(context), "agent-ui-ask"), null, "and the textarea comes back");

  bridged.apply({ type: "asking", asking: { heading: null,
    questions: [{ index: 0, total: 1, question: "type a name", allowMultiple: false,
      allowFreeform: true, options: [] }] } });
  const freeform = bridged.render(context);
  assert.ok(find(freeform, "agent-ui-ask"), "a question without options still shows");
  assert.ok(find(freeform, "agent-ui-ask-free-0"), "and offers the freeform row");
  assert.equal(svgOf(find(freeform, "agent-ui-ask-free-0")),
    "mods/agent-ui/icons/pencil.svg", "freeform is an icon, not a glyph");
  assert.ok(find(freeform, "agent-ui-ask-input-0"), "freeform input lives in the composer footer");
  assert.equal(textOf(find(freeform, "agent-ui-ask-send")), "Skip");
  bridged.answer.set_value("Use SQLite");
  assert.equal(textOf(find(bridged.render(context), "agent-ui-ask-send")), "Send");
  bridged.sendAnswer(context);
  await context.task();
  assert.deepEqual(JSON.parse(box.written.at(-1)[1]),
    { response: { kind: "freeform", text: "Use SQLite" } });
  bridged.apply({ type: "asking", asking: openAsk });
  assert.equal(bridged.answer.value(), "", "new prompts never inherit the previous answer");
  click(bridged.render(context), "agent-ui-ask-send");
  await context.task();
  assert.deepEqual(JSON.parse(box.written.at(-1)[1]), { cancel: true },
    "Skip dismisses a single unanswered question");
  assert.equal(bridged.asking, null);

  // A single choice goes out on click; a multi-select collects, then sends.
  const multiAsk = { heading: null, questions: [{ index: 0, total: 1, question: "pick some",
    allowMultiple: true, allowFreeform: false, options: [{ title: "a" }, { title: "b" }] }] };
  bridged.apply({ type: "asking", asking: multiAsk });
  bridged.pickAnswer(0, "a", context);
  assert.ok(bridged.asking, "multi-select waits for the Send button");
  bridged.pickAnswer(0, "b", context);
  bridged.pickAnswer(0, "a", context);
  bridged.sendAnswer(context);
  await context.task();
  assert.deepEqual(JSON.parse(box.written.at(-1)[1]),
    { response: { kind: "selection", selections: ["b"] } }, "a tick toggles off again");

  bridged.apply({ type: "asking", asking: openAsk });
  bridged.askKey("2", context);
  await context.task();
  assert.deepEqual(JSON.parse(box.written.at(-1)[1]),
    { response: { kind: "selection", selections: ["sqlite"] } }, "1-9 picks the n-th option");

  bridged.apply({ type: "asking", asking: multiAsk });
  bridged.askKey("space", context);
  bridged.askKey("space", context);
  assert.equal((bridged.askPicks[0] ?? []).length, 0, "space ticks and unticks");
  bridged.askKey("down", context);
  assert.equal(bridged.askCursor, 1, "the pointer follows the arrow keys");
  bridged.askKey("space", context);
  bridged.askKey("enter", context);
  await context.task();
  assert.deepEqual(JSON.parse(box.written.at(-1)[1]),
    { response: { kind: "selection", selections: ["b"] } }, "enter sends what is ticked");

  bridged.apply({ type: "asking", asking: openAsk });
  bridged.askKey("escape", context);
  await context.task();
  assert.deepEqual(JSON.parse(box.written.at(-1)[1]), { cancel: true }, "escape declines");

  // A batch is answered as a whole, which is the shape the plugin's batch surface
  // returns; anything less would answer half a prompt.
  const batchAsk = { heading: "Setup", questions: [
    { index: 0, total: 2, question: "db?", allowMultiple: false, allowFreeform: false,
      options: [{ title: "pg" }] },
    { index: 1, total: 2, question: "cache?", allowMultiple: false, allowFreeform: false,
      options: [{ title: "redis" }] }] };
  bridged.apply({ type: "asking", asking: batchAsk });
  assert.ok(find(bridged.render(context), "agent-ui-ask-1-0"), "a batch shows every question");
  bridged.pickAnswer(0, "pg", context);
  bridged.pickAnswer(1, "redis", context);
  bridged.sendAnswer(context);
  await context.task();
  assert.deepEqual(JSON.parse(box.written.at(-1)[1]), { response: [
    { status: "answered", response: { kind: "selection", selections: ["pg"] } },
    { status: "answered", response: { kind: "selection", selections: ["redis"] } }] });

  bridged.bridgeInstalled = false;
  const missing = bridged.render(context);
  assert.ok(find(missing, "agent-ui-bridge-missing"), "an uninstalled extension says so");

  box.shared = () => null;
  const demoOnly = new box.AgentUi();
  demoOnly.init({}, context);
  assert.equal(demoOnly.bridge, null, "without the shared flag the demo source stays");

  // Herdr's bundled mods draw Lucide SVGs and tint them with text_color. A font
// glyph would depend on the reader having that font, so nothing in this view may
// be a picture character.
const glyphs = [...fs.readFileSync(path.join(root, "mods/agent-ui/main.js"), "utf8")]
  .filter((ch) => ch.codePointAt(0) > 0x7e && !"·…—".includes(ch)
    && !/[\u4e00-\u9fff]/.test(ch));
assert.deepEqual(glyphs, [], "icons are svg files, never glyph characters");
for (const name of ["check", "chevron-down", "chevron-right", "arrow-down", "play",
  "square", "pencil", "x"])
  assert.ok(fs.existsSync(path.join(root, "mods/agent-ui/icons", `${name}.svg`)),
    `icons/${name}.svg ships with the mod`);

console.log("PASS: dots-only scroll rail, scrubbing, dot jump, keyboard focus, narrow turn list, empty and offline states, sticky bottom, streaming replay, bounded hover, tool detail edges, Markdown and Stack view, overlay close, bounded history, bridge reader.");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
