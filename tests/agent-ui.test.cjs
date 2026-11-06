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
      if (String(prop).startsWith("on_")) return (fn) => { target.handlers[prop] = fn; return proxy; };
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
  .replace("export const DEMO_TURNS", "const DEMO_TURNS");
vm.runInNewContext(modelSrc + "\n" + fixtureSrc
  + "\nthis.summarizeActivity=summarizeActivity;this.toRailNodes=toRailNodes;this.shortPrompt=shortPrompt;this.windowFromTurn=windowFromTurn;this.DEMO_TURNS=DEMO_TURNS;", box);

assert.equal(box.DEMO_TURNS.length, 7);
assert.equal(box.summarizeActivity([]).total, 0);
assert.deepEqual(
  [box.summarizeActivity(box.DEMO_TURNS[5].tools).failed, box.summarizeActivity(box.DEMO_TURNS[5].tools).pending],
  [1, 1],
);
assert.equal(box.toRailNodes(box.DEMO_TURNS).length, 7);
assert.ok(box.toRailNodes(box.DEMO_TURNS)[5].actionable);
assert.equal(box.toRailNodes(box.DEMO_TURNS)[0].actionable, false);
assert.equal(box.windowFromTurn(box.DEMO_TURNS, "t-failure")[0].id, "t-failure");
assert.ok(box.shortPrompt("a".repeat(120)).length <= 39);

const src = fs.readFileSync(path.join(root, "mods/agent-ui/main.js"), "utf8");
vm.runInNewContext(src.replace(/^import [^\n]+;\n/gm, "")
  .replace("export default class AgentUi", "class AgentUi")
  + "\nthis.AgentUi=AgentUi;", box);
const ui = new box.AgentUi();
ui.init();
let tree = ui.render(context);
assert.ok(find(tree, "agent-ui-root"));
assert.ok(find(tree, "agent-ui-composer"));
assert.ok(find(tree, "agent-ui-rail"));
assert.ok(find(tree, "agent-ui-rail-marker-t-inspect"));
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

ui.selectTurn("t-failure", context);
tree = ui.render(context);
assert.ok(find(tree, "agent-ui-transcript-t-failure"), "selection creates target-centered demo window");
assert.equal(find(tree, "agent-ui-user-t-inspect"), null, "earlier turns outside demo window");
assert.ok(find(tree, "agent-ui-user-t-failure"));
assert.ok(find(tree, "agent-ui-show-earlier"), "can recover earlier turns");
assert.equal(find(tree, "agent-ui-group-list-t-failure"), null, "failed group remains collapsed");
assert.match(textOf(find(tree, "agent-ui-group-trigger-t-failure")), /1 failed/, "error visible in collapsed summary");

let marker = find(tree, "agent-ui-rail-marker-t-rail");
assert.ok(marker);
marker.handlers.on_hover(true, context);
tree = ui.render(context);
const preview = find(tree, "agent-ui-rail-preview");
assert.ok(preview, "hover shows compact preview");
assert.match(textOf(preview), /右側 Message Rail/);
assert.doesNotMatch(textOf(preview), /Read \d|Run \d|Pi:|13:42|工具數量/, "no busy metadata in preview");
marker = find(tree, "agent-ui-rail-marker-t-rail");
marker.handlers.on_hover(false, context);
assert.equal(find(ui.render(context), "agent-ui-rail-preview"), null, "hover exit removes preview");
find(ui.render(context), "agent-ui-rail-marker-t-failure").handlers.on_hover(true, context);
const failurePreview = find(ui.render(context), "agent-ui-rail-preview");
assert.match(textOf(failurePreview), /需要處理/, "only exceptional second line");
click(ui.render(context), "agent-ui-rail-marker-t-rail");
assert.equal(ui.activeTurn, "t-rail", "click jumps by stable turn identity");
assert.equal(ui.hoveredTurn, null);

ui.composer.set_value("本地測試訊息");
click(ui.render(context), "agent-ui-send");
assert.equal(ui.turns.length, 8);
assert.equal(ui.composer.value(), "");
assert.ok(find(ui.render(context), "agent-ui-user-t-local-1"));
assert.match(find(ui.render(context), "agent-ui-message-a-local-1-md").markdown, /Local preview only/);

ui.changeSize({ width: 420 }, context);
assert.equal(find(ui.render(context), "agent-ui-rail"), null, "narrow mode hides the rail");

// Layout is derived from the existing personal layout by an isolated mod declaration.
const layout = spawnSync("awk", [
  "-v", "prefix=agent-ui-demo", "-v", "mod=agent-ui",
  "-f", path.join(root, "scripts/demo-layout.awk"),
  path.join(root, "layouts/herdr-mods.json"),
], { encoding: "utf8" });
assert.equal(layout.status, 0, layout.stderr);
const json = JSON.parse(layout.stdout);
const work = json.children.find((x) => x.id === "work");
const stack = work.children.find((x) => x.id === "work-body").children[0];
assert.equal(stack.id, "agent-ui-demo-surface");
assert.equal(stack.active, "agent-ui-demo-terminal");
assert.equal(stack.children[0].content.mod, "agent-ui");
assert.equal(stack.children[1].content.tab, "active");
assert.equal(work.children.find((x) => x.id === "status").content.mod, "workspace-status",
  "status is patched only when project-open is installed");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "mods/agent-ui/mod.json"), "utf8"));
assert.equal(manifest.install, "derive:agent-ui-demo");
for (const blocked of ["terminal.kill", "pane.close", "exec(", "fetch(", "Session JSONL"]) {
  assert.ok(!src.includes(blocked), "agent-ui must not invoke live agent behavior: " + blocked);
}
console.log("PASS: Agent UI fixtures, native Markdown, activity grouping, hover rail, stable jump window, mock-only composer, standalone layout.");
