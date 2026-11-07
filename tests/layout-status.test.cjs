const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const template = fs.readFileSync(path.join(root, "layouts/herdr-mods.json"), "utf8");
const awk = path.join(root, "scripts/patch-status.awk");
const compose = path.join(root, "scripts/compose-layout.awk");

function patch(source) {
  return spawnSync("awk", ["-f", awk], { input: source, encoding: "utf8" });
}
// Mods declare the bar in their own layout.json; nothing else lists them.
function mods(declarations) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mods-"));
  for (const [name, body] of Object.entries(declarations)) {
    fs.mkdirSync(path.join(dir, name));
    fs.writeFileSync(path.join(dir, name, "layout.json"), body);
  }
  return dir;
}
function fill(source, dir) {
  const result = spawnSync("awk", ["-v", `mods=${dir}`, "-f", compose], { input: source, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const filled = result.stdout;
  fs.rmSync(dir, { recursive: true, force: true });
  return filled;
}
function statusOf(source) {
  const json = JSON.parse(source);
  const work = json.children.find((x) => x.id === "work");
  return { json, work, status: work.children.find((x) => x.id === "status") };
}
// The Layout the previous installer produced: one block, owned by one Mod.
function legacy() {
  const json = JSON.parse(template);
  const work = json.children.find((x) => x.id === "work");
  const index = work.children.findIndex((x) => x.id === "status");
  work.children[index] = {
    id: "status", type: "block", size: { px: 28 }, content: { mod: "workspace-status" },
  };
  return JSON.stringify(json, null, 2) + "\n";
}
const bar = (order) => `{ "status-bar": { "order": ${order} } }\n`;

// The status area becomes a row that no Mod owns.
const patched = patch(legacy());
assert.equal(patched.status, 0, patched.stderr);
const row = statusOf(patched.stdout).status;
assert.equal(row.type, "row");
assert.equal(row.size.px, 28);
assert.equal(row.content, undefined, "no Mod owns the status area any more");
assert.equal(row.slot, undefined, "no key of ours is written into the Layout");

// A Mod asking for the bar lands in it, with an id derived from the slot and the Mod.
const one = fill(patched.stdout, mods({ "project-open": bar(10) }));
const oneBar = statusOf(one).status;
assert.deepEqual(oneBar.children, [{
  id: "status-bar-project-open", type: "block", weight: 1, content: { mod: "project-open" },
}]);
assert.equal(fill(one, mods({ "project-open": bar(10) })), one, "filling twice changes nothing");

// A Mod that does not ask for the bar stays out; a second one is appended in order.
const two = fill(patched.stdout, mods({
  "project-open": bar(10),
  "agent-ui": `{ "status-bar": { "order": 20, "size": { "px": 64 }, "props": { "mode": "bar" } } }\n`,
  "not-in-bar": `{ "derive": "somewhere" }\n`,
}));
const twoBar = statusOf(two).status;
assert.deepEqual(twoBar.children.map((x) => x.content.mod), ["project-open", "agent-ui"]);
assert.deepEqual(twoBar.children[1].size, { px: 64 });
assert.deepEqual(twoBar.children[1].content.props, { mode: "bar" });

// Nothing already in the bar is removed or reordered: a hand-edited bar stays.
const edited = JSON.parse(one);
{
  const work = edited.children.find((x) => x.id === "work");
  const status = work.children.find((x) => x.id === "status");
  status.children.unshift(
    { id: "my-clock", type: "block", size: { px: 50 }, content: { mod: "clock" } });
  status.children.splice(1, 1);
}
const refilled = statusOf(fill(JSON.stringify(edited, null, 2) + "\n", mods({ "project-open": bar(10) }))).status;
assert.deepEqual(refilled.children.map((x) => x.id), ["my-clock", "status-bar-project-open"],
  "the user's own block stays first, the missing Mod comes back after it");

// The previous installer's split status row collapses the same way.
const oldSplit = JSON.parse(template);
const splitWork = oldSplit.children.find((x) => x.id === "work");
splitWork.children[splitWork.children.findIndex((x) => x.id === "status")] = {
  id: "status", type: "row", size: { px: 28 }, children: [
    { id: "status-original", type: "block", size: { weight: 1 }, content: { mod: "workspace-status" } },
    { id: "project-open", type: "block", size: { px: 32 }, content: { mod: "project-open" } },
  ],
};
const collapsed = patch(JSON.stringify(oldSplit, null, 2) + "\n");
assert.equal(collapsed.status, 0, collapsed.stderr);
assert.deepEqual(statusOf(collapsed.stdout).status.children, undefined);

// The old sidebar button goes, and other Mods placed in the sidebar stay.
const withSidebar = legacy().replace(
  '        {\n          "id": "sidebar-footer",',
  '        {"id":"project-open","type":"block","size":{"px":38},"content":{"mod":"project-open"}},\n'
    + '        {"id":"another-mod","type":"block","size":{"px":38},"content":{"mod":"another-mod"}},\n'
    + '        {\n          "id": "sidebar-footer",'
);
const migrated = statusOf(patch(withSidebar).stdout).json;
assert.equal(migrated.children.find((x) => x.id === "sidebar").children.some((x) => x.id === "project-open"), false,
  "the old sidebar button is removed");
assert.equal(migrated.children.find((x) => x.id === "sidebar").children.some((x) => x.id === "another-mod"), true,
  "other Mods are left alone");

// A status area somebody customized is left byte-identical, and nothing is filled in.
const custom = legacy().replace('"mod": "workspace-status"', '"mod": "my-own-status"');
const customResult = patch(custom);
assert.equal(customResult.status, 3, customResult.stderr);
assert.equal(customResult.stdout, custom, "custom status layout must be untouched");
assert.equal(fill(customResult.stdout, mods({ "project-open": bar(10) })), custom, "no status row means nothing to fill");

console.log("PASS: status row, Mod-declared bar, append-only fill, idempotence, old split-row/sidebar migration, custom layout untouched.");
