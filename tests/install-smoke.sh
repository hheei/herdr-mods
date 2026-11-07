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
cp "$repo/scripts/compose-layout.awk" "$tmp/repo/scripts/compose-layout.awk"
cp "$repo/layouts/herdr-mods.json" "$tmp/repo/layouts/herdr-mods.json"
cp -R "$repo/mods/project-open" "$tmp/repo/mods/"
mkdir -p "$tmp/repo/mods/pi-mod/bridge"
printf '%s\n' 'export default class Pi {}' > "$tmp/repo/mods/pi-mod/main.js"
printf '%s\n' '{"place":"none"}' > "$tmp/repo/mods/pi-mod/mod.json"
printf '%s\n' '{"pi": "herdr-agent-ui.js"}' > "$tmp/repo/mods/pi-mod/layout.json"
printf '%s\n' 'export default function (pi) {}' > "$tmp/repo/mods/pi-mod/bridge/herdr-agent-ui.js"
printf '%s\n' 'export default class Another {}' > "$tmp/repo/mods/another-mod/main.js"
printf '%s\n' '{"place":"none"}' > "$tmp/repo/mods/another-mod/mod.json"
printf '%s\n' '{"sidebar": true}' > "$tmp/repo/mods/another-mod/layout.json"
install() { sh "$tmp/repo/scripts/install.sh" --yes "$@" >/dev/null; }
layout="$HERDR_APP_HOME/layouts/herdr-mods.json"

# Without a terminal and without --yes it reports and writes nothing: a piped or CI
# run never installs something nobody asked for.
out=$(sh "$tmp/repo/scripts/install.sh" 2>&1 || true)
case "$out" in *"re-run with --yes"*) ;; *) echo "FAIL: no-terminal run did not ask for --yes"; exit 1 ;; esac
[ ! -e "$HERDR_APP_HOME/mods/project-open" ]

# Nothing installed: the starting set is the whole checkout, so the same command
# that later refreshes also does the first install.
install
[ -f "$HERDR_APP_HOME/mods/project-open/main.js" ]
[ -f "$HERDR_APP_HOME/mods/another-mod/main.js" ]
rm -rf "$HERDR_APP_HOME/mods" "$HERDR_APP_HOME/layouts" "$tmp/pihome/extensions"

# --all means the same set once something is installed.

# No argument installs every mod folder and applies each declared wiring.
install --all
[ -f "$HERDR_APP_HOME/mods/project-open/main.js" ]
[ -f "$HERDR_APP_HOME/mods/another-mod/main.js" ]
[ "$(grep -c '"mod": "project-open"' "$layout")" -eq 1 ]
[ "$(grep -c '"id":"another-mod"' "$layout")" -eq 1 ]
[ -f "$layout.bak" ]
[ -f "$tmp/pihome/extensions/herdr-agent-ui.js" ]

# With no argument it refreshes what is installed and nothing else: a Mod added to
# the checkout afterwards does not sneak in by itself.
mkdir -p "$tmp/repo/mods/late-mod"
printf '%s\n' 'export default class Late {}' > "$tmp/repo/mods/late-mod/main.js"
printf '%s\n' '{ "place": "none" }' > "$tmp/repo/mods/late-mod/mod.json"
install
[ ! -e "$HERDR_APP_HOME/mods/late-mod" ]
install late-mod
[ -f "$HERDR_APP_HOME/mods/late-mod/main.js" ]
printf '%s\n' '// refreshed' >> "$tmp/repo/mods/project-open/main.js"
install
grep -q refreshed "$HERDR_APP_HOME/mods/project-open/main.js"

# Re-running is idempotent: one backup per asset, and no backup in mods/, where
# Herdr would read it as a Mod.
out=$(sh "$tmp/repo/scripts/install.sh" 2>&1)
case "$out" in *"mod updated"*) echo "FAIL: second run reported an update"; exit 1 ;; esac
case "$out" in *"mod unchanged"*) ;; *) echo "FAIL: second run did not report unchanged"; exit 1 ;; esac
install
[ "$(grep -c '"mod": "project-open"' "$layout")" -eq 1 ]
[ "$(grep -c '"id":"another-mod"' "$layout")" -eq 1 ]
[ "$(find "$HERDR_APP_HOME/layouts" -maxdepth 1 -name 'herdr-mods.json.bak*' | wc -l | tr -d ' ')" -eq 1 ]
[ -f "$HERDR_APP_HOME/backups/project-open/main.js" ]
[ "$(find "$HERDR_APP_HOME/mods" -maxdepth 1 -name '*.bak*' | wc -l | tr -d ' ')" -eq 0 ]
if command -v jq >/dev/null 2>&1; then
  jq -e '.children[]|select(.id=="work")|.children[]|select(.id=="status")
    | .type=="row" and ([.children[].content.mod]|index("project-open")!=null)' "$layout" >/dev/null
  jq empty "$layout"
fi

# Re-running the extension is one update with one backup, not a second copy.
install
[ "$(find "$tmp/pihome/extensions" -maxdepth 1 -name 'herdr-agent-ui.js*' | wc -l | tr -d ' ')" -eq 1 ]

# A single mod installs only that mod.
rm -rf "$HERDR_APP_HOME/mods" "$HERDR_APP_HOME/layouts"
install another-mod
[ -f "$HERDR_APP_HOME/mods/another-mod/main.js" ]
[ ! -e "$HERDR_APP_HOME/mods/project-open" ]
[ -f "$layout" ]

# layout.json is the user's call: what they edited survives a reinstall, so taking a
# Mod out of the bar sticks instead of coming back with the checkout's default.
install project-open
printf '%s\n' '{ "status-bar": { "order": 99 } }' > "$HERDR_APP_HOME/mods/project-open/layout.json"
install project-open
[ "$(cat "$HERDR_APP_HOME/mods/project-open/layout.json")" = '{ "status-bar": { "order": 99 } }' ]
printf '%s\n' '{ }' > "$HERDR_APP_HOME/mods/project-open/layout.json"
install project-open
[ "$(cat "$HERDR_APP_HOME/mods/project-open/layout.json")" = '{ }' ]

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
HERDR_APP_HOME="$tmp/bare2" sh "$tmp/repo/scripts/install.sh" pi-mod --no-layout --yes >/dev/null
[ -f "$tmp/pihome/extensions/herdr-agent-ui.js" ]
[ ! -e "$tmp/bare2/layouts" ]

# --no-layout writes files and nothing else.
HERDR_APP_HOME="$tmp/bare" sh "$tmp/repo/scripts/install.sh" --all --no-layout --yes >/dev/null
[ -f "$tmp/bare/mods/project-open/main.js" ]
[ ! -e "$tmp/bare/layouts" ]
sh "$tmp/repo/scripts/install.sh" --help >/dev/null
sh "$tmp/repo/scripts/install.sh" --nope 2>/dev/null && exit 1 || true

# An explicit XDG_CONFIG_HOME or HOME fallback still finds Herdr App Home.
unset HERDR_APP_HOME XDG_CONFIG_HOME
mkdir -p "$tmp/newhome"
HOME="$tmp/newhome" sh "$tmp/repo/scripts/install.sh" --all --yes >/dev/null
[ -f "$tmp/newhome/.config/herdr-app/layouts/herdr-mods.json" ]

# The piped one-liner stages the archive it was given.
mkdir -p "$tmp/src/herdr-mods-main" "$tmp/pipehome"
cp -R "$tmp/repo/." "$tmp/src/herdr-mods-main/"
tar -czf "$tmp/src.tgz" -C "$tmp/src" herdr-mods-main
HERDR_APP_HOME="$tmp/pipehome" HERDR_MODS_ARCHIVE_URL="file://$tmp/src.tgz" \
  sh -s -- --all --yes < "$tmp/repo/scripts/install.sh" >/dev/null 2>&1
[ -f "$tmp/pipehome/mods/project-open/main.js" ]
[ -f "$tmp/pipehome/layouts/herdr-mods.json" ]

echo "PASS: --yes required without a terminal, refresh default, --all, named scope, declared wiring, unchanged is not rewritten, customized status untouched, no-layout, env fallback, piped one-liner."
