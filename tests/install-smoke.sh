#!/bin/sh
set -eu
repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
export HERDR_APP_HOME="$tmp/home"
mkdir -p "$tmp/repo/mods/another-mod" "$tmp/repo/layouts" "$tmp/repo/scripts"
cp "$repo/scripts/install.sh" "$tmp/repo/scripts/install.sh"
cp "$repo/scripts/patch-status.awk" "$tmp/repo/scripts/patch-status.awk"
cp "$repo/layouts/herdr-mods.json" "$tmp/repo/layouts/herdr-mods.json"
cp -R "$repo/mods/project-open" "$tmp/repo/mods/"
printf '%s\n' 'export default class Another {}' > "$tmp/repo/mods/another-mod/main.js"
printf '%s\n' '{"place":"none"}' > "$tmp/repo/mods/another-mod/mod.json"
sh "$tmp/repo/scripts/install.sh"
if sh "$tmp/repo/scripts/install.sh" >"$tmp/duplicate.log" 2>&1; then echo 'FAIL overwrite'; exit 1; fi
sh "$tmp/repo/scripts/install.sh" another-mod
[ "$(grep -c '"mod": "project-open"' "$HERDR_APP_HOME/layouts/herdr-mods.json")" -eq 1 ]
[ "$(grep -c '"id":"another-mod"' "$HERDR_APP_HOME/layouts/herdr-mods.json")" -eq 1 ]
sh "$tmp/repo/scripts/install.sh" project-open --update
[ "$(grep -c '"mod": "project-open"' "$HERDR_APP_HOME/layouts/herdr-mods.json")" -eq 1 ]
[ "$(grep -c '"id":"another-mod"' "$HERDR_APP_HOME/layouts/herdr-mods.json")" -eq 1 ]
[ -f "$HERDR_APP_HOME/layouts/herdr-mods.json.bak" ]
[ "$(find "$HERDR_APP_HOME/layouts" -maxdepth 1 -name 'herdr-mods.json.bak*' | wc -l | tr -d ' ')" -eq 1 ]
[ -d "$HERDR_APP_HOME/mods/project-open.bak" ]
[ "$(find "$HERDR_APP_HOME/mods" -maxdepth 1 -name 'project-open.bak*' | wc -l | tr -d ' ')" -eq 1 ]
if command -v jq >/dev/null 2>&1; then
  jq -e '.children[]|select(.id=="work")|.children[]|select(.id=="status")|.type=="block" and .content.mod=="project-open"' "$HERDR_APP_HOME/layouts/herdr-mods.json" >/dev/null
  jq empty "$HERDR_APP_HOME/layouts/herdr-mods.json"
fi
unset HERDR_APP_HOME XDG_CONFIG_HOME
mkdir -p "$tmp/newhome"
HOME="$tmp/newhome" sh "$tmp/repo/scripts/install.sh" >/dev/null
[ -f "$tmp/newhome/.config/herdr-app/layouts/herdr-mods.json" ]
mkdir -p "$tmp/src/herdr-mods-main" "$tmp/pipehome"
cp -R "$tmp/repo/." "$tmp/src/herdr-mods-main/"
tar -czf "$tmp/src.tgz" -C "$tmp/src" herdr-mods-main
HERDR_APP_HOME="$tmp/pipehome" HERDR_MODS_ARCHIVE_URL="file://$tmp/src.tgz" \
  sh < "$tmp/repo/scripts/install.sh" >/dev/null
[ -f "$tmp/pipehome/mods/project-open/main.js" ]
mkdir -p "$tmp/plainhome"
HERDR_APP_HOME="$tmp/plainhome" sh "$repo/scripts/install.sh" --no-layout >/dev/null
[ -f "$tmp/plainhome/mods/project-open/main.js" ]
[ ! -e "$tmp/plainhome/layouts/herdr-mods.json" ]
mkdir -p "$tmp/customhome/layouts"
sed 's/"mod": "workspace-status"/"mod": "my-own-status"/' "$repo/layouts/herdr-mods.json" > "$tmp/customhome/layouts/herdr-mods.json"
cp "$tmp/customhome/layouts/herdr-mods.json" "$tmp/custom-before.json"
HERDR_APP_HOME="$tmp/customhome" sh "$repo/scripts/install.sh" >/dev/null 2>&1
[ -f "$tmp/customhome/mods/project-open/main.js" ]
cmp -s "$tmp/custom-before.json" "$tmp/customhome/layouts/herdr-mods.json"
[ ! -e "$tmp/customhome/layouts/herdr-mods.json.bak" ]
echo 'PASS: unset env, embedded status, two mods, idempotence, single .bak backups, piped one-liner, no-layout, custom layout untouched'
