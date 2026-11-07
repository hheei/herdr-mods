const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agent-manager-panel-"));
const file = path.join(tmp, "personal.json");
const get = (node, id) => node?.children?.find((item) => item.id === id);
try {
  const original = JSON.parse(fs.readFileSync(path.join(root, "layouts/herdr-mods.json"), "utf8"));
  original.children.push({ id: "agent-manager", type: "block", size: { px: 320 }, content: { mod: "agent-manager" } });
  get(get(original, "work"), "status").children = [{ id: "project-open", type: "block", content: { mod: "project-open" } }];
  fs.writeFileSync(file, JSON.stringify(original));
  const before = fs.readFileSync(file, "utf8");
  const script = path.join(root, "scripts/agent-manager-panel.cjs");
  const out = execFileSync(process.execPath, [script, file], { encoding: "utf8" });
  const backup = out.trim().split("backup: ")[1];
  assert.equal(fs.readFileSync(backup, "utf8"), before);
  const changed = JSON.parse(fs.readFileSync(file, "utf8"));
  const work = get(changed, "work");
  const panel = get(get(work, "work-body"), "panel");
  const body = get(panel, "panel-body");
  assert.equal(get(changed, "agent-manager"), undefined, "remove permanent root sidebar");
  assert.deepEqual(body.children.map((item) => item.id), ["files", "changes", "agent-manager"]);
  assert.equal(panel.hidden, true, "panel starts closed, opens only on click");
  assert.equal(get(work, "tabs").content.mod, "tabs-agent-manager");
  assert.equal(get(get(work, "status"), "project-open").content.mod, "project-open", "preserve personalized status");
  const once = fs.readFileSync(file, "utf8");
  assert.match(execFileSync(process.execPath, [script, file], { encoding: "utf8" }), /already installed/);
  assert.equal(fs.readFileSync(file, "utf8"), once, "idempotent");
  const invalid = JSON.parse(before);
  get(get(invalid, "work"), "tabs").content.mod = "custom-tabs";
  fs.writeFileSync(file, JSON.stringify(invalid));
  assert.throws(() => execFileSync(process.execPath, [script, file], { stdio: "pipe" }), /supported personal Herdr layout/);
  assert.equal(fs.readFileSync(file, "utf8"), JSON.stringify(invalid), "reject custom tabs without touching layout");
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
  const source = fs.readFileSync(path.join(root, "mods/tabs-agent-manager/main.js"), "utf8")
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
  console.log("PASS: Agent Manager is a toggleable Files/Changes panel; personal layout backed up, safe and idempotent");
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
