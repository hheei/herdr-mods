// P0 native GPUI fixture prototype: headless interaction tests.
// No live Pi/PTY/app GUI required; real Herdr App rendering still needs QA.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const fixturesSource = fs.readFileSync(path.join(root, "mods/agent-ui/fixtures.js"), "utf8")
  .replace("export const CASES", "const CASES");
const fixtureBox = {};
vm.runInNewContext(fixturesSource + "\nthis.CASES = CASES;", fixtureBox);
const CASES = fixtureBox.CASES;

const sourceFull = fs.readFileSync(path.join(root, "mods/agent-ui/main.js"), "utf8");
const source = sourceFull.replace(/^import [^\n]+;\n/gm, "")
  .replace("export default class AgentUi", "class AgentUi");

function node() {
  const state = { nodeId: null, kids: [], handlers: {}, style: {} };
  let proxy;
  proxy = new Proxy(state, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === "id") return (value) => { target.nodeId = value; return proxy; };
      if (prop === "when") return (flag, fn) => { if (flag) fn(proxy); return proxy; };
      if (prop === "children") return (xs) => { target.kids.push(...xs); return proxy; };
      if (prop === "child") return (x) => { target.kids.push(x); return proxy; };
      if (String(prop).startsWith("on_")) return (handler) => {
        target.handlers[prop] = handler;
        return proxy;
      };
      return (...args) => { target.style[prop] = args; return proxy; };
    },
  });
  return proxy;
}

function stateObject(options) {
  return {
    text: options.value ?? "",
    events: {},
    on(name, fn) { this.events[name] = fn; },
    value() { return this.text; },
    set_value(v) { this.text = v; },
    focus() {},
  };
}

const runCalls = [];
const context = { notify() {}, stop_propagation() {} };
const box = {
  View: class {},
  CASES,
  theme: () => ({
    foreground: "#EEE", muted: "#B5B5B5", dim: "#999", accent: "#8BC",
    raised: "#333", selected: "#3C4", border: "#555", background: "#222",
    input: "#667", chrome: "#111", working: "#FFD", done: "#AFA", blocked: "#F88",
  }),
  props: () => ({}),
  div: node, h_flex: node, v_flex: node,
  InputState: { new: stateObject },
  TextareaState: { new: stateObject },
  Input: { new: (_state) => node() },
  Textarea: { new: (_state) => node() },
};
vm.runInNewContext(source + "\nthis.AgentUi = AgentUi;", box);

function find(node, id) {
  if (!node || typeof node !== "object") return null;
  if (node.nodeId === id) return node;
  for (const c of node.kids || []) {
    const match = find(c, id);
    if (match) return match;
  }
  return null;
}
function textOf(node) {
  if (typeof node === "string") return node;
  if (!node || typeof node !== "object") return "";
  return (node.kids || []).map(textOf).join(" ");
}
function click(root, id) {
  const target = find(root, id);
  assert.ok(target, "missing node " + id);
  assert.equal(typeof target.handlers.on_click, "function", "missing handler for " + id);
  target.handlers.on_click(null, context);
}

assert.equal(CASES.length, 3);
const mod = new box.AgentUi();
mod.init({}, context);
let page = mod.render(context);
assert.ok(find(page, "agent-ui-root"));
assert.ok(find(page, "agent-ui-header"));
assert.ok(find(page, "agent-ui-composer"));
assert.ok(find(page, "agent-ui-textarea"));
assert.ok(find(page, "scenario-working"));
assert.ok(find(page, "tool-toggle-w-read"));
assert.equal(find(page, "tool-detail-w-read"), null);
click(page, "tool-toggle-w-read");
page = mod.render(context);
assert.ok(find(page, "tool-detail-w-read"), "expands tool details");
click(page, "tool-toggle-w-read");
assert.equal(find(mod.render(context), "tool-detail-w-read"), null, "folds tool details");

click(page, "scenario-error");
page = mod.render(context);
assert.ok(find(page, "tool-toggle-e-fail"), "error scenario visible");
assert.match(textOf(page), /Failed/, "failed tool visible");
mod.filter.set_value("nothing-matches-preview");
page = mod.render(context);
assert.match(textOf(page), /No matching preview content/, "search provides empty result");
mod.filter.set_value("");
click(mod.render(context), "scenario-done");
page = mod.render(context);
assert.ok(find(page, "d-answer"), "completed answer visible");

mod.composer.set_value("請保留我的草稿");
page = mod.render(context);
click(page, "agent-ui-send");
page = mod.render(context);
assert.equal(mod.composer.value(), "", "demo composer clears after local echo");
assert.ok(find(page, "local-0"), "locally mocked user message appears");
assert.match(textOf(page), /Mock only/, "no real send is implied");

assert.ok(!sourceFull.includes('from "fs"'));
assert.ok(!sourceFull.includes('exec('));
assert.ok(!sourceFull.includes('hc('));
assert.ok(!sourceFull.includes('terminal.kill'));
assert.equal(runCalls.length, 0);

const generated = execFileSync("sh", ["-c",
  `awk -f "${path.join(root, "scripts/patch-status.awk")}" "${path.join(root, "layouts/herdr-mods.json")}" `
  + `| awk -f "${path.join(root, "scripts/demo-layout.awk")}" -`], { encoding: "utf8" });
const layout = JSON.parse(generated);
const work = layout.children.find((child) => child.id === "work");
const body = work.children.find((child) => child.id === "work-body");
const stack = body.children[0];
assert.equal(stack.id, "agent-ui-demo-surface");
assert.equal(stack.type, "stack");
assert.equal(stack.active, "agent-ui-demo-terminal");
const ui = stack.children.find((child) => child.id === "agent-ui-demo-ui");
const terminal = stack.children.find((child) => child.id === "agent-ui-demo-terminal");
assert.equal(ui.content.mod, "agent-ui");
assert.equal(terminal.content.tab, "active");
assert.equal(body.children[1].id, "panel", "the generated stack replaces only the tab renderer");
assert.equal(work.children.find((x) => x.id === "status").content.mod, "project-open");
assert.ok(!JSON.stringify(layout).includes("terminal.park"));
console.log("PASS: native fixture UI, three scenarios, disclosure, search, mock composer, safe demo stack.");
