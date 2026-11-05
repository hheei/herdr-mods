// Headless behavior checks with Herdr/GPUI mocked. Real UI needs herdr-app check.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const fullSource = fs.readFileSync(path.join(__dirname, "../mods/project-open/main.js"), "utf8");
const source = fullSource.slice(fullSource.indexOf("const LAST_ACTION_KEY"))
  .replace("export default class ProjectOpen", "class ProjectOpen");

// Models enough of the chainable GPUI nodes to exercise event handlers.
function node() {
  const handlers = {};
  const state = { kids: [], handlers, icon: null };
  let proxy;
  proxy = new Proxy(state, {
    get(target, name) {
      if (name in target) return target[name];
      if (name === "on_click" || name === "on_mouse_down") {
        return (...args) => { handlers[name + (args.length === 2 ? ":" + args[0] : "")] = args.at(-1); return proxy; };
      }
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
  spaces: [{ id: "s1", folder: "/home/user", machine: null }],
  platform: "linux",
  props: {},
};
const box = {
  View: class {},
  div: node, h_flex: node, v_flex: node,
  svg: (icon) => { const n = node(); n.icon = icon; return n; },
  theme: () => ({ muted: "#aaa", hover: "#333", foreground: "#eee", popover: "#111" }),
  window: () => ({ platform: state.platform }),
  focused: () => state.focused,
  spaces: () => state.spaces,
  exec: async (...args) => { calls.push(args); return { code: 0, stdout: "", stderr: "" }; },
  shared: (k) => preferences[k],
  setShared: (k, v) => { preferences[k] = v; },
  notify: (n) => { calls.push(["notify", n]); },
  openOverlay: (spec) => { calls.push(["overlay", spec]); return "overlay-1"; },
  closeOverlay: (id) => { calls.push(["close", id]); },
  props: () => state.props,
};
vm.runInNewContext(source + "\nthis.ProjectOpen = ProjectOpen;", box);

async function drain() {
  for (let i = 0; i < 5; i++) {
    const promises = calls.filter((x) => x && typeof x.then === "function");
    await Promise.all(promises);
  }
}

async function main() {
  const mod = new box.ProjectOpen();
  let button = mod.render(cx);
  assert.equal(button.kids[0].icon, "mods/project-open/vscode.svg");
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
  assert.equal(preferences["project-open.last-action"], "finder");
  assert.ok(calls.some((x) => Array.isArray(x) && x[0] === "xdg-open"));

  state.props = {};
  button = mod.render(cx);
  assert.equal(button.kids[0].icon, "mods/project-open/finder.svg");

  calls.length = 0;
  state.spaces = [{ id: "s1", folder: "/home/user", machine: "gpu-server" }];
  button.handlers.on_click(null, cx);
  await drain();
  assert.ok(calls.some((x) => Array.isArray(x) && x[0] === "notify" && x[1].title === "Remote folder"));
  assert.equal(calls.some((x) => Array.isArray(x) && x[0] === "xdg-open"), false);

  calls.length = 0;
  state.props = { menu: true, overlay: "overlay-2" };
  mod.render(cx).kids[0].handlers.on_click(null, cx); // VS Code remote
  await drain();
  assert.ok(calls.some((x) => Array.isArray(x) && x[0] === "code"
    && x[1][0] === "--remote" && x[1][1] === "ssh-remote+gpu-server"));
  console.log("PASS: default click; popup; preference+icon; local opener; remote guard; remote VS Code.");
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
