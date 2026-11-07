// Headless behavior checks with Herdr/GPUI mocked. Real UI needs herdr-app check.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const fullSource = fs.readFileSync(path.join(__dirname, "../mods/hheei-status/main.js"), "utf8");
const source = fullSource.slice(fullSource.indexOf("const LAST_ACTION_KEY"))
  .replace("export default class HheeiStatus", "class HheeiStatus");

// Models enough of the chainable GPUI nodes to exercise event handlers.
function node() {
  const handlers = {};
  const state = { kids: [], handlers, icon: null, nodeId: null };
  let proxy;
  proxy = new Proxy(state, {
    get(target, name) {
      if (name in target) return target[name];
      if (name === "on_click" || name === "on_mouse_down") {
        return (...args) => { handlers[name + (args.length === 2 ? ":" + args[0] : "")] = args.at(-1); return proxy; };
      }
      if (name === "id") return (value) => { target.nodeId = value; return proxy; };
      if (name === "when") return (condition, callback) => { if (condition) callback(proxy); return proxy; };
      if (name === "child") return (child) => { target.kids.push(child); return proxy; };
      if (name === "children") return (children) => { target.kids.push(...children); return proxy; };
      return () => proxy;
    },
  });
  return proxy;
}

const calls = [];
const preferences = {};
const cx = {
  stop_propagation() {},
  spawn(cb) { calls.push(Promise.resolve().then(() => cb(cx))); },
};
const state = {
  focused: { space: "s1", cwd: "/home/user/project with spaces" },
  spaces: [{ id: "s1", folder: "/home/user", machine: null, active: true }],
  platform: "linux",
  props: {},
  agents: [],
};
const box = {
  View: class {},
  div: node, h_flex: node, v_flex: node,
  svg: (icon) => { const n = node(); n.icon = icon; return n; },
  theme: () => ({ muted: "#aaa", hover: "#333", foreground: "#eee", popover: "#111" }),
  window: () => ({ platform: state.platform }),
  focused: () => state.focused,
  spaces: () => state.spaces,
  agents: () => state.agents,
  keys: () => [],
  run: (action, args) => calls.push(["run", action, args]),
  layout: () => state.layout,
  exec: async (...args) => { calls.push(args); return { code: 0, stdout: "", stderr: "" }; },
  shared: (k) => preferences[k],
  setShared: (k, v) => { preferences[k] = v; },
  notify: (n) => { calls.push(["notify", n]); },
  openOverlay: (spec) => { calls.push(["overlay", spec]); return "overlay-1"; },
  closeOverlay: (id) => { calls.push(["close", id]); },
  props: () => state.props,
};
vm.runInNewContext(source + "\nthis.HheeiStatus = HheeiStatus;", box);

async function drain() {
  for (let i = 0; i < 5; i++) {
    const promises = calls.filter((x) => x && typeof x.then === "function");
    await Promise.all(promises);
  }
}

function findById(node, id) {
  if (!node || typeof node !== "object") return null;
  if (node.nodeId === id) return node;
  for (const child of node.kids || []) {
    const found = findById(child, id);
    if (found) return found;
  }
  return null;
}
function findButton(node) { return findById(node, "hheei-status-button"); }

async function main() {
  const mod = new box.HheeiStatus();
  const status = mod.render(cx);
  assert.ok(status.kids.length >= 4, "integrated status bar should include labels, agents, palette and icon");
  let button = findButton(status);
  assert.ok(button, "button must be nested inside status bar, not a separate layout block");
  assert.equal(button.kids[0].icon, "mods/hheei-status/vscode.svg");
  assert.equal(fullSource.includes(".tooltip("), false, "main icon should not show hover tooltips");
  assert.equal(fullSource.includes(".hover((s) => s.bg(t.hover).text_color(t.foreground))"), false, "main icon should not show a hover highlight");
  button.handlers.on_click(null, cx);
  await drain();
  assert.ok(calls.some((x) => Array.isArray(x) && x[0] === "code" && x[1][0] === "/home/user/project with spaces"));

  calls.length = 0;
  button.handlers["on_mouse_down:right"](null, cx);
  assert.equal(calls[0][0], "overlay");
  assert.equal(calls[0][1].kind, "popup");

  state.props = { menu: true, overlay: "overlay-1" };
  const menu = mod.render(cx);
  assert.equal(menu.kids.length, 2);
  menu.kids[1].handlers.on_click(null, cx); // file manager
  await drain();
  assert.equal(preferences["hheei-status.last-action"], "finder");
  assert.equal(calls.some((x) => Array.isArray(x) && x[0] === "xdg-open"), false,
    "right-click choice must not launch an application");

  state.props = {};
  button = findButton(mod.render(cx));
  assert.equal(button.kids[0].icon, "mods/hheei-status/finder.svg");

  calls.length = 0;
  button.handlers.on_click(null, cx);
  await drain();
  assert.ok(calls.some((x) => Array.isArray(x) && x[0] === "xdg-open"),
    "left click should launch selected file manager");
  calls.length = 0;
  state.spaces = [{ id: "s1", folder: "/home/user", machine: "gpu-server", active: true }];
  button.handlers.on_click(null, cx);
  await drain();
  assert.ok(calls.some((x) => Array.isArray(x) && x[0] === "notify" && x[1].title === "Remote folder"));
  assert.equal(calls.some((x) => Array.isArray(x) && x[0] === "xdg-open"), false);

  calls.length = 0;
  state.props = { menu: true, overlay: "overlay-2" };
  mod.render(cx).kids[0].handlers.on_click(null, cx); // VS Code remote
  await drain();
  assert.equal(calls.some((x) => Array.isArray(x) && x[0] === "code"), false,
    "choosing VS Code in context menu should not launch");
  assert.equal(preferences["hheei-status.last-action"], "vscode");
  state.props = {};
  findButton(mod.render(cx)).handlers.on_click(null, cx);
  await drain();
  assert.ok(calls.some((x) => Array.isArray(x) && x[0] === "code"
    && x[1][0] === "--remote" && x[1][1] === "ssh-remote+gpu-server"));

  // The Agent UI is a view of the focused pane's agent: offered only while such an
  // agent has focus, and opened as a window over that pane, never as a layout change.
  calls.length = 0;
  const withoutAgent = mod.render(cx);
  assert.ok(findButton(withoutAgent), "Project Open remains available");
  assert.equal(findById(withoutAgent, "agent-ui-demo-toggle"), null,
    "legacy segmented control must not exist");
  assert.equal(findById(withoutAgent, "agent-ui-mode"), null,
    "no focused agent, no Agent UI to offer");
  state.agents = [{ address: "a1", status: "working", focused: true }];
  const withAgent = mod.render(cx);
  let switcher = findById(withAgent, "agent-ui-mode");
  assert.ok(switcher, "a focused agent gets one mode icon");
  const cluster = withAgent.kids.find((kid) => (kid.kids || []).some((x) => x.nodeId === "agent-ui-mode"));
  assert.ok(cluster && cluster.kids.some((x) => x.nodeId === "hheei-status-button"),
    "the Agent UI icon sits in the left status cluster beside the launcher");
  assert.equal((cluster.kids || []).some((x) => x.nodeId === "palette"), false,
    "the Commands hint stays at the far end, past the spacer");
  assert.equal(switcher.kids.length, 1);
  assert.equal(switcher.kids[0].icon, "mods/hheei-status/agent-ui.svg");
  switcher.handlers.on_click(null, cx);
  const opened = calls.find((x) => x[0] === "overlay" && x[1].mod === "agent-ui");
  assert.ok(opened, "the button opens the Agent UI as an overlay");
  assert.equal(opened[1].kind, "dialog", "a dialog dims what is behind it");
  assert.equal(opened[1].modal, true, "a click beside it must not close the Agent UI");
  assert.equal(opened[1].frame, "none", "the Mod draws its own frame");
  assert.equal(opened[1].width, 0.62);
  assert.equal(preferences["hheei-status.agent-ui-overlay"], "overlay-1");
  assert.equal(calls.some((x) => x[0] === "run" && x[1] === "layout.select"), false,
    "no layout is switched to show the Agent UI");
  calls.length = 0;
  switcher = findById(mod.render(cx), "agent-ui-mode");
  assert.equal(switcher.kids[0].icon, "mods/hheei-status/agent-terminal.svg",
    "while it is up, the icon goes back to the terminal");
  switcher.handlers.on_click(null, cx);
  assert.ok(calls.some((x) => x[0] === "close" && x[1] === "overlay-1"));
  assert.equal(preferences["hheei-status.agent-ui-overlay"], null);
  assert.equal(calls.some((x) => x[0] === "terminal.kill" || x[0] === "pane.close"), false);
  // The agent may exit first; the window still has to be closable.
  state.agents = [];
  preferences["hheei-status.agent-ui-overlay"] = "overlay-2";
  assert.ok(findById(mod.render(cx), "agent-ui-mode"),
    "an open window stays closable after its agent is gone");
  preferences["hheei-status.agent-ui-overlay"] = null;
  // svg() has no intrinsic size of its own: an asset without width/height draws
  // nothing at any .size(), and a stroke that is not currentColor ignores the
  // theme. The status-bar icons are the ones this Mod owns, so check them here.
  for (const file of ["vscode", "finder", "agent-ui", "agent-terminal"]
    .map((name) => path.join(__dirname, "../mods/hheei-status", `${name}.svg`))) {
    const svg = fs.readFileSync(file, "utf8");
    assert.match(svg, /width="\d+"/, `${file} needs a width, or .size(15) has no basis`);
    assert.match(svg, /height="\d+"/, `${file} needs a height`);
    assert.match(svg, /currentColor/, `${file} must take its colour from the theme`);
  }
  console.log("PASS: default click; popup; preference+icon; local opener; remote guard; remote VS Code; Agent UI dialog.");
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
