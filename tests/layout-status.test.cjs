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
  assert.equal(status.type, "block");
  assert.equal(status.size.px, 28);
  assert.equal(status.content.mod, "project-open");
  assert.equal(status.children, undefined, "no separate status child/slot");
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

const oldSplit = JSON.parse(base);
const work = oldSplit.children.find(x => x.id === "work");
const idx = work.children.findIndex(x => x.id === "status");
work.children[idx] = {
  id: "status", type: "row", size: { px: 28 }, children: [
    { id: "status-original", type: "block", size: { weight: 1 }, content: { mod: "workspace-status" } },
    { id: "project-open", type: "block", size: { px: 32 }, content: { mod: "project-open" } },
  ],
};
checkStatus(patch(JSON.stringify(oldSplit, null, 2) + "\n"));
// A customized status bar is left byte-identical instead of being rewritten.
const custom = JSON.parse(base);
const customWork = custom.children.find(x => x.id === "work");
customWork.children.find(x => x.id === "status").content.mod = "my-own-status";
const customText = JSON.stringify(custom, null, 2) + "\n";
const customResult = spawnSync("awk", ["-f", awk], { input: customText, encoding: "utf8" });
assert.equal(customResult.status, 3, customResult.stderr);
assert.equal(customResult.stdout, customText, "custom status layout must be untouched");

console.log("PASS: single status block, old split-row/sidebar migration, idempotence, other mods, custom layout untouched.");
