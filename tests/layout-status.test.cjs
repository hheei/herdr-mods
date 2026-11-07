const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const template = fs.readFileSync(path.join(root, "layouts/herdr-mods.json"), "utf8");
const awk = path.join(root, "scripts/patch-status.awk");
const compose = path.join(root, "scripts/compose-layout.sh");
const mods = path.join(root, "mods");

function patch(source) {
  return spawnSync("awk", ["-f", awk], { input: source, encoding: "utf8" });
}
function fillSlots(source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slot-"));
  const file = path.join(dir, "layout.json");
  fs.writeFileSync(file, source);
  const result = spawnSync("sh", [compose, file], {
    encoding: "utf8",
    env: { ...process.env, HERDR_MODS_MODS_DIR: mods },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const filled = fs.readFileSync(file, "utf8");
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

// The status area becomes a slot, and the Mods that declare the slot fill it.
const patched = patch(legacy());
assert.equal(patched.status, 0, patched.stderr);
const slot = statusOf(patched.stdout).status;
assert.equal(slot.type, "row");
assert.equal(slot.size.px, 28);
assert.equal(slot.slot, "status-bar", "the slot is what survives, not a Mod name");
assert.equal(slot.content, undefined, "no Mod owns the status area any more");

const filled = fillSlots(patched.stdout);
const filledStatus = statusOf(filled).status;
assert.equal(filledStatus.type, "row");
assert.equal(filledStatus.slot, "status-bar", "the slot stays, so the next install can refill it");
const ids = filledStatus.children.map((x) => x.content.mod);
assert.ok(ids.includes("project-open"), "a Mod declaring the slot lands in it");
assert.equal(filledStatus.children.find((x) => x.content.mod === "project-open").weight, 1,
  "a Mod without a size takes a share");
assert.equal(
  filledStatus.children.every((x) => x.id === `status-bar-${x.content.mod}`),
  true,
  "block ids come from the slot and the Mod"
);
assert.equal(fillSlots(filled), filled, "filling twice changes nothing");

// The previous installer's split status row collapses into the same slot.
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
assert.equal(statusOf(collapsed.stdout).status.slot, "status-bar");

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

// A status area somebody customized is left byte-identical, and filling finds no slot.
const custom = legacy().replace('"mod": "workspace-status"', '"mod": "my-own-status"');
const customResult = patch(custom);
assert.equal(customResult.status, 3, customResult.stderr);
assert.equal(customResult.stdout, custom, "custom status layout must be untouched");
assert.equal(fillSlots(customResult.stdout), custom, "no slot means nothing to fill");

console.log("PASS: status slot, Mod-declared fill, old split-row/sidebar migration, other mods, custom layout untouched.");
