#!/bin/sh
# Isolated demo-layout contract: derived from the personal layout, refreshed whole.
set -eu
repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
export HERDR_APP_HOME="$tmp/home"
mkdir -p "$HERDR_APP_HOME/layouts" "$HERDR_APP_HOME/mods/agent-ui"
cp "$repo/layouts/herdr-mods.json" "$HERDR_APP_HOME/layouts/herdr-mods.json"
printf 'Original custom agent-ui marker\n' > "$HERDR_APP_HOME/mods/agent-ui/CUSTOM"
awk -f "$repo/scripts/patch-status.awk" "$repo/layouts/herdr-mods.json" \
  | awk -f "$repo/scripts/demo-layout.awk" - > "$tmp/expected.json"

sh "$repo/scripts/install.sh" agent-ui project-open >/dev/null
[ -f "$HERDR_APP_HOME/layouts/agent-ui-demo.json" ]
[ -f "$HERDR_APP_HOME/mods/agent-ui/main.js" ]
[ -f "$HERDR_APP_HOME/mods/agent-ui.bak/CUSTOM" ]
grep -q '"mod": "project-open"' "$HERDR_APP_HOME/layouts/herdr-mods.json"
cmp "$HERDR_APP_HOME/layouts/agent-ui-demo.json" "$tmp/expected.json"

# Re-running regenerates the demo layout and keeps exactly one backup each.
printf '{"id":"custom-demo-layout"}\n' > "$HERDR_APP_HOME/layouts/agent-ui-demo.json"
sh "$repo/scripts/install.sh" agent-ui project-open >/dev/null
cmp "$HERDR_APP_HOME/layouts/agent-ui-demo.json" "$tmp/expected.json"
grep -q custom-demo-layout "$HERDR_APP_HOME/layouts/agent-ui-demo.json.bak"
[ "$(find "$HERDR_APP_HOME" -name 'agent-ui-demo.json.bak*' | wc -l | tr -d ' ')" -eq 1 ]
[ "$(find "$HERDR_APP_HOME/mods" -maxdepth 1 -name 'agent-ui.bak*' | wc -l | tr -d ' ')" -eq 1 ]

# Alone, the demo mod derives from the personal layout but never leaves the
# status bar unwired: only the status-kind mod patches it.
mkdir -p "$tmp/alone/layouts"
cp "$repo/layouts/herdr-mods.json" "$tmp/alone/layouts/herdr-mods.json"
HERDR_APP_HOME="$tmp/alone" sh "$repo/scripts/install.sh" agent-ui >/dev/null
[ -f "$tmp/alone/layouts/agent-ui-demo.json" ]
cmp "$tmp/alone/layouts/herdr-mods.json" "$repo/layouts/herdr-mods.json"

# A customized work-body is left alone instead of guessed at.
mkdir -p "$tmp/custom/layouts"
sed 's/"id": "main"/"id": "custom-tab"/' "$repo/layouts/herdr-mods.json" > "$tmp/custom/layouts/herdr-mods.json"
HERDR_APP_HOME="$tmp/custom" sh "$repo/scripts/install.sh" agent-ui project-open >/dev/null 2>&1
[ ! -e "$tmp/custom/layouts/agent-ui-demo.json" ]
[ -f "$tmp/custom/mods/agent-ui/main.js" ]
echo "PASS: demo layout derived from the personal layout, refreshed as a whole, one .bak each."
