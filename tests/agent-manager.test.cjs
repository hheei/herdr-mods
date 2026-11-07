const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const fullSource = fs.readFileSync(path.join(__dirname, "../mods/agent-manager/main.js"), "utf8");
assert.equal(JSON.parse(fs.readFileSync(path.join(__dirname, "../mods/agent-manager/mod.json"), "utf8")).place, "none");
const source = fullSource.slice(fullSource.indexOf("const AGENTS ="))
  .replace("export default class AgentManager", "class AgentManager");
const state = { platform: "macos", focused: { space: "a", cwd: "/work/project" }, spaces: [{ id: "a", folder: "/work", machine: "linux-box", active: true }], calls: [], icons: [], iconNodes: [], modal: null, shared: {} };
const remote = { agents: { claude: true, codex: true, pi: true, agy: true }, mcp: { claude: {}, codex: {}, pi: {}, agy: {} }, skills: { shared: {}, claude: {}, codex: {}, pi: {}, agy: {} }, skill_methods: { shared: {}, claude: {}, codex: {}, pi: {}, agy: {} }, skill_locked: { shared: [], claude: [], codex: [], pi: [], agy: [] }, library: { beta: "b".repeat(64), gamma: "c".repeat(64) }, mcp_library: {} };
function node() {
  const n = new Proxy({ kids: [], style: {} }, {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      if (prop === "id") return (id) => { obj.id = id; return n; };
      if (prop === "tooltip") return (value) => { obj.tooltipText = value; return n; };
      if (prop === "child") return (child) => { obj.kids.push(child); return n; };
      if (prop === "children") return (children) => { obj.kids.push(...children); return n; };
      if (prop === "on_click") return (fn) => { obj.onClick = fn; return n; };
      if (prop === "on_mouse_down") return (button, fn) => { (obj.mouseDown ||= {})[button] = fn; return n; };
      if (prop === "on_hover") return (fn) => { obj.onPointerHover = fn; return n; };
      if (prop === "hover") return (fn) => { obj.onHover = fn; return n; };
      if (prop === "when") return (condition, fn) => { if (condition) assert.equal(fn(n), n, "GPUI when callback must return an element"); return n; };
      if (["size", "w", "h", "px", "gap", "rounded", "bg", "border_1", "border_color", "border_b", "border_t", "p", "relative", "absolute", "overflow_y_scroll", "text_color", "text_size"].includes(prop)) return (value) => { obj.style[prop] = value ?? true; return n; };
      return () => n;
    },
  });
  return n;
}
const pending = [];
const cx = { spawn(fn) { pending.push(Promise.resolve().then(() => fn(cx))); }, notify() {} };
const box = {
  View: class {}, div: node, h_flex: node, v_flex: node, Scrollbar: { vertical: node },
  Editor: { new: (editorState) => { const element = node(); element.editorState = editorState; return element; } },
  EditorState: { new: (options) => ({ options, release() {} }) }, settings: () => ({ font_family: "monospace" }),
  svg: (asset) => { const icon = node(); state.icons.push(asset); state.iconNodes.push(icon); return icon; },
  theme: () => ({ background: "#111", foreground: "#fff", muted: "#999", dim: "#666", hover: "#333", raised: "#222", selected: "#383838", blocked: "#f44", ansi2: "#4a4", solid: "#eee", solid_foreground: "#111", accent: "#0f0", border: "#444" }),
  window: () => ({ platform: state.platform }), focused: () => state.focused, spaces: () => state.spaces,
  home: () => "/user-home", appHome: () => "/app-home", notify: (msg) => state.calls.push(["notify", msg]),
  props: () => state.modal || {}, openOverlay: (spec) => { state.modal = spec.props; state.calls.push(["overlay", spec]); return "overlay-1"; },
  closeOverlay: () => { state.modal = null; }, shared: (key) => state.shared[key] || null,
  setShared: (key, value) => { state.shared[key] = value; },
  exec: async (...args) => {
    state.calls.push(["exec", ...args]);
    const argv = args[1];
    const stdout = args[0] === "python3" ? JSON.stringify({ alpha: "a".repeat(64), beta: "b".repeat(64) })
      : argv[0] === "-c" ? JSON.stringify([{ id: "demo", name: "Demo MCP" }, { id: "node_repl", name: "Node REPL" }])
      : argv[0].endsWith("manage.sh") ? argv[1] === "status" ? JSON.stringify(remote)
        : argv[1] === "read" ? "# Skill preview\n"
        : argv[1] === "delete" ? (delete remote.library[argv[3]], "Removed (backup retained)")
        : argv[1] === "import" ? (remote.library[argv[3]] = "f".repeat(64), "Imported")
        : (remote[argv[3]][argv[5]][argv[4]] = argv[6] === "disable" ? "off" : "on",
          argv[3] === "skills" && (remote.skill_methods[argv[5]][argv[4]] = argv[6] === "disable" ? undefined : argv[8] || "link"), "Updated")
      : argv[0].endsWith("sync.sh") ? (argv[3] === "upload" && (remote.library[argv[2]] = "a".repeat(64)), "Skills copied")
      : "Skills copied";
    return { code: 0, stdout, stderr: "" };
  },
};
vm.runInNewContext(source + "\nthis.AgentManager = AgentManager; this.currentTarget = target;", box);
function ids(root) { return [root?.id, ...(root?.kids || []).flatMap(ids)].filter(Boolean); }
function find(root, id) { return root?.id === id ? root : (root?.kids || []).map((child) => find(child, id)).find(Boolean); }
function allNodes(root) { return root && typeof root === "object" ? [root, ...(root.kids || []).flatMap(allNodes)] : []; }
async function main() {
  assert.equal(box.currentTarget().machine, "linux-box");
  assert.equal(box.currentTarget().cwd, "/work");
  const mod = new box.AgentManager();
  const first = mod.render(cx);
  assert.equal(state.calls.length, 0);
  assert.equal(pending.length, 1, "load current Workspace automatically like Files and Changes");
  for (const name of ["claude", "codex", "pi", "agy"]) assert.ok(state.icons.includes("mods/agent-manager/icons/" + name + ".svg"));
  for (const name of ["claude", "codex", "pi", "agy"]) {
    const index = state.icons.indexOf("mods/agent-manager/icons/" + name + ".svg");
    assert.equal(state.iconNodes[index].style.size, 13, "agent icons shrink from 19px to 13px");
  }
  assert.equal(find(first, "agent-manager").style.rounded, 10, "match native Files and Changes panel frame");
  assert.equal(find(first, "agent-manager").style.border_1, true);
  assert.equal(first.kids.length, 3, "native header, scrolling body, footer");
  assert.equal(first.kids[0].style.h, 42);
  assert.equal(first.kids[0].style.border_b, 1);
  assert.equal(first.kids[1].style.relative, true);
  assert.equal(find(first, "agent-manager-list").style.overflow_y_scroll, undefined, "outer panel does not scroll sections together");
  assert.equal(find(first, "agent-manager-skills-list").style.overflow_y_scroll, true);
  assert.equal(find(first, "agent-manager-mcp-list").style.overflow_y_scroll, true);
  assert.deepEqual(Array.from(find(first, "skills-header").kids.slice(-4), (node) => node.tooltipText),
    [".claude/skills", ".codex/skills", ".pi/skills", ".agents/skills"], "Agent icons retain path hints");
  assert.equal(first.kids[2].style.border_t, 1);
  assert.equal(first.kids[2].style.p, 10);
  assert.ok(find(first, "skills-refresh").kids.includes("Refresh"));
  assert.ok(find(first, "scope-toggle").kids.includes("Project"));
  assert.ok(find(first, "skills-import").kids.includes("Import"));
  assert.equal(find(first, "skills-sync"), undefined, "redundant bulk sync button removed");
  assert.equal(find(first, "skills-row-0"), undefined);
  await Promise.all(pending.splice(0));
  assert.deepEqual(Array.from(mod.skills, (entry) => entry.id), ["beta", "gamma", "alpha"], "remote-present Skills first, missing remote below");
  assert.equal(mod.mcps[0].id, "demo");
  assert.equal(mod.mcps.length, 1, "node_repl hidden without touching CC Switch database");
  const catalogQuery = state.calls.find((call) => call[0] === "exec" && call[1] === "sh" && call[2][0] === "-c" && call[2][1].includes("sqlite3"));
  assert.match(catalogQuery[2][1], /"SELECT .* WHERE id <> 'node_repl' ORDER BY .*"/, "SQLite string literal survives shell quoting");
  assert.equal(mod.status.agents.agy, true);
  const loadedTree = mod.render(cx);
  const iconNodes = new Set(["skills-header", "mcp-header"].flatMap((id) => find(loadedTree, id).kids.slice(-4)));
  const sourceNodes = allNodes(loadedTree).filter((node) => /^skills-source-\d+$/.test(node.id || ""));
  assert.ok(sourceNodes.length > 0 && sourceNodes.every((node) => node.tooltipText), "Skill prefix icons retain source hints");
  assert.equal(find(loadedTree, "skills-source-0").tooltipText, "Already in sync");
  assert.equal(find(loadedTree, "skills-source-1").tooltipText, "Download to local library");
  const withoutIcons = allNodes(loadedTree).filter((node) => !iconNodes.has(node) && !sourceNodes.includes(node));
  assert.ok(withoutIcons.every((node) => !Object.hasOwn(node, "tooltipText")), "status cells and buttons stay tooltip-free");
  assert.equal(find(mod.render(cx), "skills-row-2"), undefined, "Mac-only Skill lives in Import, not main list");
  assert.ok(!fullSource.includes("On remote ·") && !fullSource.includes("Not on remote ·"));
  find(mod.render(cx), "skills-import").onClick(null, cx);
  assert.equal(state.modal.imports.items[0].id, "alpha");
  const importDialog = new box.AgentManager().render(cx);
  assert.equal(find(importDialog, "skill-import-list").style.overflow_y_scroll, true);
  find(importDialog, "skill-import-0").onClick(null, cx);
  await Promise.all(pending.splice(0));
  assert.equal(state.modal, null);
  assert.equal(remote.library.alpha, "a".repeat(64));
  mod.render(cx);
  await Promise.all(pending.splice(0));
  for (const agent of ["claude", "codex", "pi", "shared"]) assert.ok(ids(mod.render(cx)).includes("skills-0-" + agent));
  assert.ok(!ids(mod.render(cx)).includes("skills-0-agy"));
  assert.ok(ids(mod.render(cx)).includes("mcp-0-agy"), "Project MCP still supports Antigravity");
  assert.ok(state.icons.includes("mods/workspace-chrome/layers.svg"));
  assert.equal(find(mod.render(cx), "skills-0-shared").style.bg, undefined,
    "off cells stay flat like native file rows, not big square buttons");
  assert.ok(ids(mod.render(cx)).includes("skills-0-claude"));
  mod.toggle(cx, "skills", "alpha", "shared", "off");
  await Promise.all(pending.splice(0));
  assert.equal(mod.status.skills.shared.alpha, "on");
  assert.equal(find(mod.render(cx), "skills-0-shared").style.bg, undefined);
  mod.toggle(cx, "skills", "alpha", "codex", "off");
  await Promise.all(pending.splice(0));
  assert.equal(mod.status.skills.codex.alpha, "on");
  assert.equal(mod.status.skills.shared.alpha, "on");
  const codexSkill = state.calls.find((call) => call[0] === "exec" && call[2][0].endsWith("manage.sh") && call[2][3] === "skills" && call[2][5] === "codex");
  assert.deepEqual(Array.from(codexSkill[2].slice(1)), ["apply", "linux-box", "skills", "alpha", "codex", "enable", "/work"]);
  const alphaIndex = mod.skills.findIndex((skill) => skill.id === "alpha");
  assert.equal(find(mod.render(cx), `skills-${alphaIndex}-shared`).style.text_color, "#4a4");
  const linkedCell = find(mod.render(cx), `skills-${alphaIndex}-codex`);
  assert.equal(linkedCell.kids[0].kids[0], "~", "symlinks display tilde");
  assert.equal(linkedCell.kids[0].style.w, 11, "checkbox shrinks roughly 30% from 16px");
  assert.equal(linkedCell.kids[0].style.h, 11);
  assert.equal(linkedCell.kids[0].style.text_size, 9);
  assert.equal(linkedCell.kids[0].style.border_color, "#666", "checkbox border starts dim");
  assert.equal(Object.hasOwn(linkedCell, "onHover"), false, "checkbox hit area has no hover background");
  assert.equal(Object.hasOwn(find(mod.render(cx), `skills-row-${alphaIndex}`), "onHover"), false, "row does not color checkbox background");
  assert.equal(Object.hasOwn(linkedCell, "onPointerHover"), true, "full 28px cell handles pointer entry");
  linkedCell.onPointerHover(true, cx);
  const hoveredCell = find(mod.render(cx), `skills-${alphaIndex}-codex`);
  assert.equal(hoveredCell.kids[0].style.border_color, "#999", "pointer entry strengthens border before any click");
  assert.equal(hoveredCell.kids[0].style.bg, undefined);
  hoveredCell.onPointerHover(false, cx);
  assert.equal(find(mod.render(cx), `skills-${alphaIndex}-codex`).kids[0].style.border_color, "#666", "pointer exit restores dim border");
  assert.equal(find(mod.render(cx), "mcp-0-claude").kids[0].style.w, 11);
  assert.equal(state.calls.filter((call) => call[0] === "notify" && call[1].level === "info").length, 0, "skill deployment succeeds silently");
  linkedCell.mouseDown.right(null, { stop_propagation() {} });
  assert.equal(state.modal.skillMenu.agent, "codex");
  const popup = state.calls.findLast((call) => call[0] === "overlay" && call[1].props.skillMenu)[1];
  assert.equal(popup.width, 200, "match Herdr's default popup width");
  assert.equal(popup.height, undefined, "popup fits menu content");
  const menu = new box.AgentManager().render(cx);
  assert.equal(menu.style.text_size, 12.8);
  assert.equal(menu.style.p, 5);
  assert.equal(menu.style.border_1, undefined, "popup frame comes from Herdr, not the mod");
  assert.equal(find(menu, "skill-menu-copy").style.h, 31);
  assert.equal(find(menu, "skill-menu-copy").kids[0].style.size, 14);
  find(new box.AgentManager().render(cx), "skill-menu-copy").onClick(null, cx);
  await Promise.all(pending.splice(0));
  assert.equal(remote.skill_methods.codex.alpha, "copy");
  assert.ok(state.calls.some((call) => call[0] === "exec" && call[2][0].endsWith("manage.sh")
    && Array.from(call[2].slice(1)).join("|") === "apply|linux-box|skills|alpha|codex|enable|/work|copy"));
  mod.render(cx); await Promise.all(pending.splice(0));
  assert.equal(find(mod.render(cx), `skills-${alphaIndex}-codex`).kids[0].kids[0], "✓", "copies display check");
  const beforeRefresh = state.calls.filter((call) => call[0] === "exec" && call[2][0].endsWith("manage.sh") && call[2][8] === "copy").length;
  find(mod.render(cx), `skills-${alphaIndex}-codex`).mouseDown.right(null, { stop_propagation() {} });
  find(new box.AgentManager().render(cx), "skill-menu-copy").onClick(null, cx);
  await Promise.all(pending.splice(0));
  assert.equal(state.calls.filter((call) => call[0] === "exec" && call[2][0].endsWith("manage.sh") && call[2][8] === "copy").length, beforeRefresh + 1, "copy selection refreshes existing copy");
  mod.render(cx); await Promise.all(pending.splice(0));
  find(mod.render(cx), `skills-${alphaIndex}-codex`).mouseDown.right(null, { stop_propagation() {} });
  find(new box.AgentManager().render(cx), "skill-menu-link").onClick(null, cx);
  await Promise.all(pending.splice(0));
  mod.render(cx); await Promise.all(pending.splice(0));
  assert.equal(remote.skill_methods.codex.alpha, "link");
  const skillName = find(mod.render(cx), `skills-name-${alphaIndex}`);
  skillName.onClick(null, cx);
  assert.equal(state.modal.skillView.id, "alpha", "left-click opens remote SKILL.md");
  const preview = new box.AgentManager(); preview.render(cx);
  await Promise.all(pending.splice(0));
  assert.equal(preview.preview.editor.options.value, "# Skill preview\n");
  assert.equal(preview.preview.editor.options.readonly, true);
  find(preview.render(cx), "skill-document-close").onClick(null, cx);
  skillName.mouseDown.right(null, { stop_propagation() {} });
  assert.equal(state.modal.skillMenu.id, "alpha", "right-click opens Skill actions");
  const actionMenu = new box.AgentManager().render(cx);
  assert.equal(find(actionMenu, "skill-menu-open").kids[1].kids[0], "Open");
  assert.equal(find(actionMenu, "skill-menu-delete").kids[1].kids[0], "Delete");
  find(new box.AgentManager().render(cx), "skill-menu-delete").onClick(null, cx);
  assert.equal(state.modal.skillDelete.id, "alpha");
  find(new box.AgentManager().render(cx), "skill-delete-cancel").onClick(null, cx);
  const gammaIndex = mod.skills.findIndex((skill) => skill.id === "gamma");
  find(mod.render(cx), `skills-name-${gammaIndex}`).mouseDown.right(null, { stop_propagation() {} });
  find(new box.AgentManager().render(cx), "skill-menu-delete").onClick(null, cx);
  find(new box.AgentManager().render(cx), "skill-delete-action").onClick(null, cx);
  await Promise.all(pending.splice(0));
  assert.equal(remote.library.gamma, undefined, "deletion affects remote library");
  const deleteCall = state.calls.find((call) => call[0] === "exec" && call[2][0].endsWith("manage.sh") && call[2][1] === "delete");
  assert.deepEqual(Array.from(deleteCall[2].slice(1)), ["delete", "linux-box", "gamma", "c".repeat(64), "/work"], "deletion checks current Workspace");
  assert.equal(mod.localLibrary.beta, "b".repeat(64), "Mac library is unchanged");
  assert.ok(!state.calls.some((call) => call[0] === "notify" && call[1].level === "info"), "Skill actions have no success notifications");
  mod.render(cx); await Promise.all(pending.splice(0));
  const projectSkill = state.calls.find((call) => call[0] === "exec" && call[2][0].endsWith("manage.sh") && call[2][3] === "skills");
  assert.equal(projectSkill[2][0], "/app-home/mods/agent-manager/manage.sh");
  assert.deepEqual(Array.from(projectSkill[2].slice(1)), ["apply", "linux-box", "skills", "alpha", "shared", "enable", "/work"]);
  mod.toggle(cx, "mcp", "demo", "claude", "off");
  await Promise.all(pending.splice(0));
  const deploy = state.calls.find((call) => call[0] === "exec" && call[2][0].endsWith("manage.sh") && call[2][3] === "mcp");
  assert.deepEqual(Array.from(deploy[2].slice(1)), ["apply", "linux-box", "mcp", "demo", "claude", "enable", "/work"]);
  assert.equal(mod.status.mcp.claude.demo, "on");
  const sync = state.calls.find((call) => call[0] === "exec" && call[2][0].endsWith("sync.sh"));
  assert.equal(sync[2][0], "/app-home/mods/agent-manager/sync.sh");
  assert.equal(sync[2][1], "linux-box");
  assert.deepEqual(Array.from(sync[2].slice(2)), ["alpha", "upload"], "individual Skill icon transfers only selected Skill");
  assert.equal(sync[3].timeout, 600000);
  assert.ok(state.icons.includes("mods/agent-manager/icons/download.svg"));
  assert.ok(state.icons.includes("mods/agent-manager/icons/sync.svg"));
  assert.ok(find(mod.render(cx), `skills-source-${alphaIndex}`), "imported Skill now appears in main list");
  const sourceCell = find(mod.render(cx), `skills-source-${alphaIndex}`);
  assert.equal(sourceCell.style.w, 16);
  assert.equal(sourceCell.style.h, 28);
  assert.equal(sourceCell.kids[0].style.size, 11);
  assert.equal(find(mod.render(cx), `skills-row-${alphaIndex}`).style.px, 4);
  assert.equal(find(mod.render(cx), `skills-row-${alphaIndex}`).style.gap, 3);
  for (const kind of ["skills", "mcp"]) {
    const header = find(mod.render(cx), kind + "-header");
    const row = find(mod.render(cx), kind + "-row-0");
    assert.equal(header.style.px, row.style.px, kind + " columns use matching horizontal padding");
    assert.equal(header.style.gap, row.style.gap, kind + " columns use matching gaps");
  }
  remote.skills.shared.loose = "external";
  mod.refresh(cx);
  await Promise.all(pending.splice(0));
  assert.equal(mod.skills.find((skill) => skill.id === "loose").remote, null);
  assert.equal(find(mod.render(cx), "skills-row-3"), undefined, "unmanaged Agent Skill appears only in Import");
  find(mod.render(cx), "skills-import").onClick(null, cx);
  const orphan = state.modal.imports.items.findIndex((skill) => skill.id === "loose" && skill.origin === "shared");
  assert.ok(orphan >= 0);
  find(new box.AgentManager().render(cx), `skill-import-${orphan}`).onClick(null, cx);
  await Promise.all(pending.splice(0));
  assert.ok(state.calls.some((call) => call[0] === "exec" && call[2][0].endsWith("manage.sh")
    && call[2][1] === "import" && call[2][3] === "loose" && call[2][4] === "shared" && call[2][5] === "/work"));
  assert.ok(state.calls.some((call) => call[0] === "exec" && call[2][0].endsWith("sync.sh")
    && call[2][2] === "loose" && call[2][3] === "download"));
  assert.equal(remote.library.loose, "f".repeat(64));
  assert.ok(!state.calls.some((call) => call[0] === "notify" && call[1].level === "info" && call[1].title.startsWith("Skill")), "Import succeeds silently");
  assert.equal(remote.skills.shared.loose, "external", "import never rewrites existing Agent Skill");
  assert.equal(state.modal, null);
  mod.render(cx);
  await Promise.all(pending.splice(0));
  mod.switchScope(cx);
  await Promise.all(pending.splice(0));
  assert.equal(mod.scope, "global");
  assert.ok(ids(mod.render(cx)).includes("skills-0-claude"));
  assert.ok(!ids(mod.render(cx)).includes("skills-0-shared"));
  remote.library.adoptable = "d".repeat(64);
  remote.skills.pi.adoptable = "library-link";
  remote.skill_methods.pi.adoptable = "link";
  mod.refresh(cx);
  await Promise.all(pending.splice(0));
  const adoptableIndex = mod.skills.findIndex((skill) => skill.id === "adoptable");
  const unadopted = find(mod.render(cx), `skills-${adoptableIndex}-pi`);
  assert.equal(unadopted.kids[0].kids[0], "+", "unadopted CC Switch library symlink shows adopt action");
  assert.equal(Object.hasOwn(unadopted, "onClick"), false, "unadopted Skill is read-only by left-click");
  mod.toggle(cx, "skills", "adoptable", "pi", "library-link");
  assert.equal(remote.skills.pi.adoptable, "library-link", "direct activation cannot adopt");
  const adoptableName = find(mod.render(cx), `skills-name-${adoptableIndex}`);
  adoptableName.mouseDown.right(null, { stop_propagation() {} });
  assert.ok(state.modal.skillMenu.adopters.some((agent) => agent.id === "pi"));
  find(new box.AgentManager().render(cx), "skill-menu-adopt-pi").onClick(null, cx);
  await Promise.all(pending.splice(0));
  mod.render(cx); await Promise.all(pending.splice(0));
  const adoptedIndex = mod.skills.findIndex((skill) => skill.id === "adoptable");
  const adopted = find(mod.render(cx), `skills-${adoptedIndex}-pi`);
  assert.equal(adopted.kids[0].kids[0], "~", "adopted symlink shows deployment method");
  assert.equal(adopted.style.text_color, "#4a4", "adopted symlink shows active managed state");
  remote.skills.codex.beta = "cc-switch";
  const nativeCalls = state.calls.length;
  mod.toggle(cx, "skills", "beta", "codex", "cc-switch");
  assert.equal(state.calls.length, nativeCalls, "CC Switch-owned Skill remains under native ownership");
  remote.skills.claude.alpha = "external";
  mod.refresh(cx); await Promise.all(pending.splice(0));
  const beforeClickAdopt = state.calls.length;
  mod.toggle(cx, "skills", "alpha", "claude", "external");
  assert.equal(state.calls.length, beforeClickAdopt, "external Skill stays read-only by click");
  const externalIndex = mod.skills.findIndex((skill) => skill.id === "alpha");
  const externalName = find(mod.render(cx), `skills-name-${externalIndex}`);
  externalName.mouseDown.right(null, { stop_propagation() {} });
  assert.ok(state.modal.skillMenu.adopters.some((agent) => agent.id === "claude"));
  find(new box.AgentManager().render(cx), "skill-menu-adopt-claude").onClick(null, cx);
  await Promise.all(pending.splice(0));
  assert.ok(state.calls.some((call) => call[0] === "exec" && call[2][0].endsWith("manage.sh") && call[2][6] === "adopt"));
  const statusCall = state.calls.filter((call) => call[0] === "exec" && call[2][0].endsWith("manage.sh") && call[2][1] === "status").at(-1);
  assert.deepEqual(Array.from(statusCall[2].slice(1)), ["status", "linux-box"]);
  mod.switchScope(cx);
  await Promise.all(pending.splice(0));
  state.spaces[0].folder = "/work/other";
  remote.library.beta = "d".repeat(64);
  mod.refresh(cx);
  await Promise.all(pending.splice(0));
  const changedBeta = mod.skills.filter((skill) => skill.remote).findIndex((skill) => skill.id === "beta");
  assert.equal(find(mod.render(cx), `skills-source-${changedBeta}`).tooltipText, "Choose version to keep");
  await Promise.all(pending.splice(0));
  mod.syncOne(cx, mod.skills.find((skill) => skill.id === "beta"));
  assert.ok(state.calls.some((call) => call[0] === "overlay" && call[1].props.conflict?.id === "beta"), "conflict prompts instead of overwriting");
  const dialog = new box.AgentManager().render(cx);
  find(dialog, "skill-upload").onClick(null, cx);
  await Promise.all(pending.splice(0));
  assert.ok(state.calls.some((call) => call[0] === "exec" && call[2][0].endsWith("sync.sh") && call[2][2] === "beta" && call[2][4] === "b".repeat(64) && call[2][5] === "d".repeat(64)));
  const beforeStale = state.calls.length;
  mod.toggle(cx, "mcp", "demo", "claude", "on");
  assert.equal(state.calls.length, beforeStale);
  const count = state.calls.length;
  state.platform = "linux";
  mod.toggle(cx, "mcp", "demo", "claude", "on");
  mod.syncOne(cx, mod.skills[0]);
  assert.equal(state.calls.length, count);
  state.platform = "macos";
  state.spaces[0].machine = null;
  mod.syncOne(cx, mod.skills[0]);
  assert.equal(state.calls.length, count);
  state.spaces[0].machine = "linux-box";
  state.spaces[0].folder = "";
  state.modal = null;
  const noFolder = new box.AgentManager();
  noFolder.render(cx);
  await Promise.all(pending.splice(0));
  assert.equal(box.currentTarget().cwd, "/work/project", "missing Space folder falls back to focused terminal in same Space");
  assert.ok(noFolder.status, "Project status works without any preexisting project configuration");
  assert.ok(state.calls.some((call) => call[0] === "exec" && call[2][0].endsWith("manage.sh") && call[2][1] === "status" && call[2][3] === "/work/project"));
  state.focused.cwd = "";
  const noDirectory = new box.AgentManager();
  noDirectory.render(cx);
  await Promise.all(pending.splice(0));
  assert.match(noDirectory.message, /Project needs an absolute Workspace folder or its focused terminal directory/);
  noDirectory.switchScope(cx);
  await Promise.all(pending.splice(0));
  assert.equal(noDirectory.scope, "global");
  assert.ok(noDirectory.status, "Global status works without a Workspace folder");
  assert.ok(find(noDirectory.render(cx), "scope-toggle").kids.includes("Global"));
  console.log("PASS: icon matrix, real remote status, MCP deployment routing, macOS/remote guards");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
