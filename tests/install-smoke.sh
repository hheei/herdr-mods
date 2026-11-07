#!/bin/sh
# Installer contract: never touch the developer's real App Home.
set -eu
repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
export HERDR_APP_HOME="$tmp/home"
# Never touch the developer's real Pi config.
export PI_CODING_AGENT_DIR="$tmp/pihome"
mkdir -p "$tmp/repo/mods/another-mod" "$tmp/repo/layouts" "$tmp/repo/scripts"
cp "$repo/scripts/install.sh" "$tmp/repo/scripts/install.sh"
cp "$repo/scripts/tui.sh" "$tmp/repo/scripts/tui.sh"
cp "$repo/scripts/patch-status.awk" "$tmp/repo/scripts/patch-status.awk"
cp "$repo/scripts/patch-sidebar.awk" "$tmp/repo/scripts/patch-sidebar.awk"
cp "$repo/scripts/demo-layout.awk" "$tmp/repo/scripts/demo-layout.awk"
cp "$repo/scripts/compose-layout.sh" "$tmp/repo/scripts/compose-layout.sh"
cp "$repo/scripts/compose-layout.awk" "$tmp/repo/scripts/compose-layout.awk"
cp "$repo/layouts/herdr-mods.json" "$tmp/repo/layouts/herdr-mods.json"
cp -R "$repo/mods/project-open" "$tmp/repo/mods/"
mkdir -p "$tmp/repo/mods/pi-mod/bridge"
printf '%s\n' 'export default class Pi {}' > "$tmp/repo/mods/pi-mod/main.js"
printf '%s\n' '{"place":"none","install":"pi:herdr-agent-ui.js"}' > "$tmp/repo/mods/pi-mod/mod.json"
printf '%s\n' 'export default function (pi) {}' > "$tmp/repo/mods/pi-mod/bridge/herdr-agent-ui.js"
printf '%s\n' 'export default class Another {}' > "$tmp/repo/mods/another-mod/main.js"
printf '%s\n' '{"place":"none","install":"sidebar"}' > "$tmp/repo/mods/another-mod/mod.json"
install() { sh "$tmp/repo/scripts/install.sh" "$@" >/dev/null; }
layout="$HERDR_APP_HOME/layouts/herdr-mods.json"

# No argument installs every mod folder and applies each declared wiring.
install
[ -f "$HERDR_APP_HOME/mods/project-open/main.js" ]
[ -f "$HERDR_APP_HOME/mods/another-mod/main.js" ]
[ "$(grep -c '"mod": "project-open"' "$layout")" -eq 1 ]
[ "$(grep -c '"id":"another-mod"' "$layout")" -eq 1 ]
[ -f "$layout.bak" ]
[ -f "$tmp/pihome/extensions/herdr-agent-ui.js" ]

# Re-running is idempotent: one backup per asset, and no backup in mods/, where
# Herdr would read it as a Mod.
install
[ "$(grep -c '"mod": "project-open"' "$layout")" -eq 1 ]
[ "$(grep -c '"id":"another-mod"' "$layout")" -eq 1 ]
[ "$(find "$HERDR_APP_HOME/layouts" -maxdepth 1 -name 'herdr-mods.json.bak*' | wc -l | tr -d ' ')" -eq 1 ]
[ -f "$HERDR_APP_HOME/backups/project-open/main.js" ]
[ -f "$HERDR_APP_HOME/backups/another-mod/main.js" ]
[ "$(find "$HERDR_APP_HOME/mods" -maxdepth 1 -name '*.bak*' | wc -l | tr -d ' ')" -eq 0 ]
if command -v jq >/dev/null 2>&1; then
  jq -e '.children[]|select(.id=="work")|.children[]|select(.id=="status")
    | .type=="row" and .slot=="status-bar" and ([.children[].content.mod]|index("project-open")!=null)' "$layout" >/dev/null
  jq empty "$layout"
fi

# Re-running the extension is one update with one backup, not a second copy.
install
[ "$(find "$tmp/pihome/extensions" -maxdepth 1 -name 'herdr-agent-ui.js*' | wc -l | tr -d ' ')" -eq 2 ]
[ -f "$tmp/pihome/extensions/herdr-agent-ui.js.bak" ]

# A single mod installs only that mod.
rm -rf "$HERDR_APP_HOME/mods" "$HERDR_APP_HOME/layouts"
install another-mod
[ -f "$HERDR_APP_HOME/mods/another-mod/main.js" ]
[ ! -e "$HERDR_APP_HOME/mods/project-open" ]
[ -f "$layout" ]

# A customized status bar is left alone; the mods still install.
mkdir -p "$HERDR_APP_HOME/layouts"
node -e '
const fs = require("node:fs");
const json = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const work = json.children.find((node) => node.id === "work");
const index = work.children.findIndex((node) => node.id === "status");
work.children[index] = { id: "status", type: "block", size: { px: 28 }, content: { mod: "my-status" } };
fs.writeFileSync(process.argv[2], JSON.stringify(json, null, 2) + "\n");
' "$repo/layouts/herdr-mods.json" "$layout"
install
grep -q '"mod": "my-status"' "$layout"
[ "$(grep -c '"mod": "project-open"' "$layout")" -eq 0 ]
[ -f "$HERDR_APP_HOME/mods/project-open/main.js" ]

# The Pi extension is not layout wiring: it installs with --no-layout too.
HERDR_APP_HOME="$tmp/bare2" sh "$tmp/repo/scripts/install.sh" pi-mod --no-layout >/dev/null
[ -f "$tmp/pihome/extensions/herdr-agent-ui.js" ]
[ ! -e "$tmp/bare2/layouts" ]

# --no-layout writes files and nothing else.
HERDR_APP_HOME="$tmp/bare" sh "$tmp/repo/scripts/install.sh" --no-layout >/dev/null
[ -f "$tmp/bare/mods/project-open/main.js" ]
[ ! -e "$tmp/bare/layouts" ]
sh "$tmp/repo/scripts/install.sh" --help >/dev/null
sh "$tmp/repo/scripts/install.sh" --nope 2>/dev/null && exit 1 || true

# An explicit XDG_CONFIG_HOME or HOME fallback still finds Herdr App Home.
unset HERDR_APP_HOME XDG_CONFIG_HOME
mkdir -p "$tmp/newhome"
HOME="$tmp/newhome" sh "$tmp/repo/scripts/install.sh" >/dev/null
[ -f "$tmp/newhome/.config/herdr-app/layouts/herdr-mods.json" ]

# The piped one-liner stages the archive it was given.
mkdir -p "$tmp/src/herdr-mods-main" "$tmp/pipehome"
cp -R "$tmp/repo/." "$tmp/src/herdr-mods-main/"
tar -czf "$tmp/src.tgz" -C "$tmp/src" herdr-mods-main
HERDR_APP_HOME="$tmp/pipehome" HERDR_MODS_ARCHIVE_URL="file://$tmp/src.tgz" \
  sh < "$tmp/repo/scripts/install.sh" >/dev/null 2>&1
[ -f "$tmp/pipehome/mods/project-open/main.js" ]
[ -f "$tmp/pipehome/layouts/herdr-mods.json" ]

echo "PASS: all-mods default, declared wiring, single mod, idempotence, one .bak each, customized status untouched, no-layout, env fallback, piped one-liner."
