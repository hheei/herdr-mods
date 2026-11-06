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
const context = { notify() {}, stop_propagation() {} };
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
  Textarea: { new: () => node() },
};
const modelSrc = fs.readFileSync(path.join(root, "mods/agent-ui/model.js"), "utf8").replace(/^export /gm, "");
const fixtureSrc = fs.readFileSync(path.join(root, "mods/agent-ui/fixtures.js"), "utf8")
  .replace(/^export const /gm, "const ");
vm.runInNewContext(modelSrc + "\n" + fixtureSrc
  + "\nthis.summarizeActivity=summarizeActivity;this.toRailNodes=toRailNodes;this.shortPrompt=shortPrompt;this.turnGeometry=turnGeometry;this.clampScroll=clampScroll;this.visibleTurnIds=visibleTurnIds;this.railLayout=railLayout;this.dotSize=dotSize;this.railHit=railHit;this.previewTop=previewTop;this.railScrubOffset=railScrubOffset;this.FIXTURE_TURNS=FIXTURE_TURNS;this.DEMO_TURNS=DEMO_TURNS;", box);

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
assert.equal(rail.pitch, 14, "an 11px dot plus a 3px gap");
assert.equal(rail.perDot, 2, "15 turns collapse into the 40% column, not 15 dots");
assert.equal(rail.dots.length, 8);
const centers = rail.dots.map((dot) => dot.center);
centers.slice(1).forEach((center, i) =>
  assert.equal(center - centers[i], 14, "dots are 3px apart"));
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
assert.equal(sizes[rail.focus], 11, "peak at the reading position");
assert.equal(sizes[0], 6, "the far end of the packet is a 6px floor dot");
assert.equal(sizes.at(-1), 6);
sizes.slice(rail.focus).slice(1).forEach((size, i) =>
  assert.ok(size <= sizes[rail.focus + i], "the packet decays away from focus"));
assert.equal(box.dotSize(3, 3, 6, 11), 11);
assert.equal(box.dotSize(9, 3, 6, 11), 6);
assert.equal(box.dotSize(4, 3, 6, 11), 9);

// A long history buckets several turns per dot instead of overflowing.
const many = Array.from({ length: 400 }, (_, i) =>
  ({ id: `m-${i}`, start: i * 100, end: i * 100 + 90 }));
const dense = box.railLayout(many, 340);
assert.equal(dense.dots.length, 9, "a 400-turn history still fits the column");
assert.equal(dense.perDot, 45);
assert.equal(dense.dots[0].turnIds.length, 45);
assert.equal(dense.dots.at(-1).id, "m-360");
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
ui.init();
ui.turns = box.FIXTURE_TURNS.map((turn) => ({
  ...turn, messages: [...turn.messages], tools: [...turn.tools],
}));
let tree = ui.render(context);
assert.ok(find(tree, "agent-ui-root"));
assert.ok(find(tree, "agent-ui-composer"));
assert.ok(find(tree, "agent-ui-rail"));
assert.ok(find(tree, "agent-ui-rail-marker-t-inspect"));
assert.equal(find(tree, "agent-ui-rail").style.w[0], 18);
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
const inactiveDot = find(tree, "agent-ui-rail-marker-t-live").kids[0];
assert.equal(inactiveDot.style.size[0], 6, "a dot away from the focus sits at the 6px floor");
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
assert.doesNotMatch(textOf(failurePreview), /需要處理/,
  "a failed tool is NOT an actionable approval request");
const originalPinColor = find(ui.render(context), "agent-ui-rail-marker-t-failure").kids[0].style.bg[0];
ui.turns[5].requiresUserAction = true;
let actionPreview = find(ui.render(context), "agent-ui-rail-preview");
assert.match(textOf(actionPreview), /需要處理/,
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
assert.equal(longRail.dots.length, 12, "60 turns collapse into 12 dots at 460px");
assert.equal(longRail.perDot, 5);
assert.ok(longRail.dots.length * longRail.pitch <= ui.viewportHeight * 0.4,
  "the long-history column still respects the 40% bound");
const longRender = ui.render(context);
assert.ok(find(longRender, "agent-ui-rail"));
assert.ok(find(longRender, `agent-ui-rail-marker-${longRail.dots.at(-1).id}`),
  "the last bucket is reachable");
assert.ok(find(longRender, "agent-ui-user-t-long-01"), "generated turns are mounted");

console.log("PASS: dots-only scroll rail, scrubbing, dot jump, multi-highlight, bounded hover, tools, Markdown and Stack view.");
