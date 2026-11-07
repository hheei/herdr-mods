#!/bin/sh
# agent-ui installs as Mod files plus a Pi extension; it touches no Layout.
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
export HERDR_APP_HOME="$tmp/home"
# Never install an extension into the developer's real Pi config.
export PI_CODING_AGENT_DIR="$tmp/pihome"
mkdir -p "$HERDR_APP_HOME/layouts" "$HERDR_APP_HOME/mods/agent-ui"
cp "$root/layouts/herdr-mods.json" "$HERDR_APP_HOME/layouts/main.json"
printf '{"id":"untouched-personal-layout"}\n' > "$HERDR_APP_HOME/layouts/personal.json"
printf 'old Agent UI version\n' > "$HERDR_APP_HOME/mods/agent-ui/OLD"
sh "$root/scripts/install.sh" agent-ui hheei-status --yes >/dev/null
[ -f "$HERDR_APP_HOME/mods/agent-ui/main.js" ]
[ -f "$HERDR_APP_HOME/mods/agent-ui/model.js" ]
[ -f "$HERDR_APP_HOME/mods/agent-ui/fixtures.js" ]
[ -f "$HERDR_APP_HOME/backups/agent-ui/OLD" ]
[ -f "$HERDR_APP_HOME/mods/hheei-status/agent-ui.svg" ]
[ -f "$PI_CODING_AGENT_DIR/extensions/herdr-agent-ui.js" ]
# The Agent UI is a view of a pane, not a Layout: nothing is derived, nothing moves.
[ ! -e "$HERDR_APP_HOME/layouts/agent-ui-demo.json" ]
grep -q untouched-personal-layout "$HERDR_APP_HOME/layouts/personal.json"
cmp "$HERDR_APP_HOME/layouts/main.json" "$root/layouts/herdr-mods.json"
node - "$HERDR_APP_HOME/mods/agent-ui/layout.json" <<'NODE'
const fs = require("fs"), assert = require("node:assert/strict");
const decl = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
assert.deepEqual(Object.keys(decl), ["pi"], "agent-ui asks for an extension, not a Layout");
NODE

# Re-running is one update with one backup, and still no Layout.
printf '{"id":"custom-personal"}\n' > "$HERDR_APP_HOME/layouts/personal.json"
sh "$root/scripts/install.sh" agent-ui hheei-status --yes >/dev/null
grep -q custom-personal "$HERDR_APP_HOME/layouts/personal.json"
[ ! -e "$HERDR_APP_HOME/layouts/agent-ui-demo.json" ]
[ "$(find "$HERDR_APP_HOME/mods/agent-ui" -name '*.bak*' | wc -l | tr -d ' ')" -eq 0 ]
[ "$(find "$HERDR_APP_HOME/backups/agent-ui" -maxdepth 1 -mindepth 1 | wc -l | tr -d ' ')" -eq 1 ]

# --no-layout writes files and nothing else.
HERDR_APP_HOME="$tmp/bare" PI_CODING_AGENT_DIR="$tmp/pihome2" \
  sh "$root/scripts/install.sh" agent-ui --no-layout --yes >/dev/null
[ -f "$tmp/bare/mods/agent-ui/main.js" ]
[ ! -e "$tmp/bare/layouts" ]
echo "PASS: agent-ui installs Mod files and its Pi extension, leaves every Layout alone, backs up once."
