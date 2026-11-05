const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const base = fs.readFileSync(path.join(root, "layouts/herdr-mods.json"), "utf8");
const awk = path.join(root, "scripts/patch-status.awk");

function patch(source) {
  const result = spawnSync("awk", ["-f", awk], { input: source, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}
function checkStatus(source) {
  const json = JSON.parse(source);
  const work = json.children.find(x => x.id === "work");
  const status = work.children.find(x => x.id === "status");
  assert.equal(status.type, "row");
  assert.equal(status.size.px, 28);
  assert.equal(status.children[0].id, "status-original");
  assert.equal(status.children[0].content.mod, "workspace-status");
  assert.equal(status.children[1].id, "project-open");
  assert.equal(status.children[1].content.mod, "project-open");
  const sidebar = json.children.find(x => x.id === "sidebar");
  assert.equal(sidebar.children.some(x => x.id === "project-open"), false);
}
const first = patch(base);
checkStatus(first);
assert.equal(patch(first), first, "repeating the patch must be idempotent");

// The previous installer put a compact project-open node just before sidebar-footer.
const legacy = base.replace(
  '        {\n          "id": "sidebar-footer",',
  '        {"id":"project-open","type":"block","size":{"px":38},"content":{"mod":"project-open"}},\n        {\n          "id": "sidebar-footer",'
);
assert.notEqual(legacy, base);
checkStatus(patch(legacy));

// Preserve any other installed sidebar mods.
const withOtherMod = legacy.replace(
  '        {\n          "id": "sidebar-footer",',
  '        {"id":"another-mod","type":"block","size":{"px":38},"content":{"mod":"another-mod"}},\n        {\n          "id": "sidebar-footer",'
);
const migrated = JSON.parse(patch(withOtherMod));
assert.equal(
  migrated.children.find(x => x.id === "sidebar").children.some(x => x.id === "another-mod"),
  true
);
console.log("PASS: status placement, preserved status content, old sidebar migration, idempotence, other mods.");
