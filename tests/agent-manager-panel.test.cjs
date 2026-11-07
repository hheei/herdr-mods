const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const get = (node, id) => node?.children?.find((item) => item.id === id);
const patch = (script, text, vars = {}) => spawnSync("awk",
  [...Object.entries(vars).flatMap(([key, value]) => ["-v", `${key}=${value}`]), "-f", path.join(root, "scripts", script)],
  { input: text, encoding: "utf8" }).stdout;
const point = (text, from, to) => patch("patch-mod.awk", text, { from, to });

// The panel block is appended to panel-body and never reordered.
const template = fs.readFileSync(path.join(root, "layouts/herdr-mods.json"), "utf8");
const patched = patch("patch-panel.awk", template, { mod: "agent-manager" });
const changed = JSON.parse(patched);
const work = get(changed, "work");
const panel = get(get(work, "work-body"), "panel");
const body = get(panel, "panel-body");
assert.deepEqual(body.children.map((item) => item.id), ["files", "changes", "agent-manager"]);
assert.equal(body.children[0].content.mod, "files", "the Files block is left exactly as it was");
assert.equal(panel.hidden, true, "panel starts closed, opens only on click");
assert.equal(patch("patch-panel.awk", patched, { mod: "agent-manager" }), patched, "a second pass changes nothing");
// Shipped Mods stay read-only: the Layout points at ours instead, tab bar and bar.
const retabbed = point(point(patched, "tabs", "hheei-tabs"), "workspace-status", "hheei-status");
const bar = JSON.parse(retabbed);
assert.equal(get(bar, "work").children.find((x) => x.id === "tabs").content.mod, "hheei-tabs");
assert.equal(get(bar, "work").children.find((x) => x.id === "status").content.mod, "hheei-status");
assert.equal(point(retabbed, "tabs", "hheei-tabs"), retabbed, "pointing again changes nothing");
assert.equal(point(retabbed, "some-one-elses-mod", "x"), retabbed, "only the named shipped Mod moves");

// A Layout without a panel belongs to its owner: printed back byte for byte.
const bare = JSON.stringify({ id: "root", type: "row", children: [{ id: "work", type: "column", children: [] }] }, null, 2) + "\n";
assert.equal(patch("patch-panel.awk", bare, { mod: "agent-manager" }), bare, "a Layout without a panel is its owner's");

{
  const stored = new Map();
  const calls = [];
  const spaces = [{ id: "a", active: true, tabs: [] }, { id: "b", active: false, tabs: [] }];
  const makeNode = () => {
    const n = new Proxy({ kids: [], handlers: {} }, {
      get(obj, key) {
        if (key in obj) return obj[key];
        if (key === "id") return (value) => { obj.id = value; return n; };
        if (key === "child") return (value) => { obj.kids.push(value); return n; };
        if (key === "children") return (values) => { obj.kids.push(...values); return n; };
        if (key === "when") return (test, fn) => { if (test) fn(n); return n; };
        if (key === "on_click") return (fn) => { obj.handlers.click = fn; return n; };
        return () => n;
      },
    });
    return n;
  };
  const find = (node, id) => !node ? null : node.id === id ? node : node.kids?.map((x) => find(x, id)).find(Boolean);
  const box = {
    View: class {}, div: makeNode, h_flex: makeNode, svg: makeNode, image: makeNode,
    theme: () => ({ chrome: "#111", border: "#333", foreground: "#eee", muted: "#aaa", dim: "#aaa", raised: "#222", hover: "#333", selected: "#444" }),
    spaces: () => spaces, panes: () => [], layout: () => changed, settings: () => ({ zoom: 1 }),
    window: () => ({ platform: "macos", titlebar: "none", fullscreen: false }),
    shared: () => ["files", "changes"], openOverlay() {},
    localStorage: { getItem: (key) => stored.get(key), setItem: (key, value) => stored.set(key, value) },
    run: (name, args) => {
      calls.push([name, args]);
      if (name === "layout.select") body.active = args.child;
      if (name === "layout.show") panel.hidden = false;
      if (name === "layout.hide") panel.hidden = true;
    },
  };
  const source = fs.readFileSync(path.join(root, "mods/hheei-tabs/main.js"), "utf8")
    .replace(/^import .*;\n/gm, "").replace("export default class Tabs", "class Tabs");
  vm.runInNewContext(source + "\nthis.Tabs=Tabs;", box);
  const tabs = new box.Tabs(); tabs.init();
  const button = find(tabs.render(), "panel-agent-manager");
  assert.ok(button, "Manager button lives beside Files and Changes");
  assert.ok(find(tabs.render(), "panel-files"));
  assert.ok(find(tabs.render(), "panel-changes"));
  button.handlers.click();
  assert.deepEqual(calls.slice(-2).map((entry) => entry[0]), ["layout.select", "layout.show"]);
  assert.equal(body.active, "agent-manager");
  assert.equal(panel.hidden, false);
  tabs.render();
  assert.equal(JSON.parse(stored.get("panels")).a, "agent-manager", "remember Manager per space");
  find(tabs.render(), "panel-agent-manager").handlers.click();
  assert.equal(panel.hidden, true, "same button closes panel");
  console.log("PASS: panel block appended beside Files and Changes, tab bar and status bar pointed at ours, both idempotent, a bare Layout untouched, Manager toggles per space");
}
