#!/bin/sh
# Canonical agent-ui demo installer contract (replaces older previews).
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
export HERDR_APP_HOME="$tmp/home"
# Never install an extension into the developer's real Pi config.
export PI_CODING_AGENT_DIR="$tmp/pihome"
mkdir -p "$HERDR_APP_HOME/layouts" "$HERDR_APP_HOME/mods/agent-ui"
cp "$root/layouts/herdr-mods.json" "$HERDR_APP_HOME/layouts/herdr-mods.json"
cp "$root/layouts/herdr-mods.json" "$HERDR_APP_HOME/layouts/main.json"
printf '{"id":"untouched-personal-layout"}\n' > "$HERDR_APP_HOME/layouts/personal.json"
printf 'old Agent UI version\n' > "$HERDR_APP_HOME/mods/agent-ui/OLD"
sh "$root/scripts/install.sh" agent-ui project-open >/dev/null
[ -f "$HERDR_APP_HOME/mods/agent-ui/main.js" ]
[ -f "$HERDR_APP_HOME/mods/agent-ui/model.js" ]
[ -f "$HERDR_APP_HOME/mods/agent-ui/fixtures.js" ]
[ -f "$HERDR_APP_HOME/backups/agent-ui/OLD" ]
[ -f "$HERDR_APP_HOME/mods/project-open/agent-ui.svg" ]
[ -f "$HERDR_APP_HOME/layouts/agent-ui-demo.json" ]
[ ! -d "$HERDR_APP_HOME/mods/agent-ui-v2" ]
[ ! -e "$HERDR_APP_HOME/layouts/agent-ui-v2-demo.json" ]
grep -q untouched-personal-layout "$HERDR_APP_HOME/layouts/personal.json"
cmp "$HERDR_APP_HOME/layouts/main.json" "$root/layouts/herdr-mods.json"

node - "$HERDR_APP_HOME/layouts/agent-ui-demo.json" <<'NODE'
const fs = require("fs"), assert = require("node:assert/strict");
const layout = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const work = layout.children.find(x => x.id === "work");
const stack = work.children.find(x => x.id === "work-body").children[0];
assert.equal(stack.id, "agent-ui-demo-surface");
assert.equal(stack.type, "stack");
assert.equal(stack.active, "agent-ui-demo-terminal");
assert.equal(stack.children.find(x => x.id === "agent-ui-demo-ui").content.mod, "agent-ui");
assert.equal(stack.children.find(x => x.id === "agent-ui-demo-terminal").content.tab, "active");
const status = work.children.find(x => x.id === "status");
assert.equal(status.type, "row", "the demo Layout keeps the shared status row");
assert.equal(status.children.some(x => x.content.mod === "project-open"), true);
NODE

printf '{"id":"custom-demo"}\n' > "$HERDR_APP_HOME/layouts/agent-ui-demo.json"
sh "$root/scripts/install.sh" agent-ui project-open >/dev/null
grep -q custom-demo "$HERDR_APP_HOME/layouts/agent-ui-demo.json.bak"
[ "$(find "$HERDR_APP_HOME/layouts" -name 'agent-ui-demo.json.bak*' | wc -l | tr -d ' ')" -eq 1 ]
[ "$(find "$HERDR_APP_HOME/mods" -maxdepth 1 -name 'agent-ui.bak*' | wc -l | tr -d ' ')" -eq 0 ]
grep -q untouched-personal-layout "$HERDR_APP_HOME/layouts/personal.json"

# Customized work-body must not be guessed/replaced.
mkdir -p "$tmp/unsupported/layouts"
sed 's/"id": "main"/"id": "custom-tab"/' "$root/layouts/herdr-mods.json" > "$tmp/unsupported/layouts/herdr-mods.json"
HERDR_APP_HOME="$tmp/unsupported" sh "$root/scripts/install.sh" agent-ui project-open >/dev/null 2>&1
[ ! -e "$tmp/unsupported/layouts/agent-ui-demo.json" ]
echo "PASS: canonical Agent UI installation, backup, isolated layout, no duplicate v2."
