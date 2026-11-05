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
[ "$(grep -c '"id":"project-open"' "$HERDR_APP_HOME/layouts/herdr-mods.json")" -eq 1 ]
[ "$(grep -c '"id":"another-mod"' "$HERDR_APP_HOME/layouts/herdr-mods.json")" -eq 1 ]
sh "$tmp/repo/scripts/install.sh" project-open --update
[ "$(grep -c '"id":"project-open"' "$HERDR_APP_HOME/layouts/herdr-mods.json")" -eq 1 ]
[ "$(grep -c '"id":"another-mod"' "$HERDR_APP_HOME/layouts/herdr-mods.json")" -eq 1 ]
[ "$(find "$HERDR_APP_HOME/layouts" -maxdepth 1 -name 'herdr-mods.json.bak-*' | wc -l | tr -d ' ')" -ge 2 ]
[ "$(find "$HERDR_APP_HOME/mods" -maxdepth 1 -name 'project-open.bak-*' | wc -l | tr -d ' ')" -ge 1 ]
if command -v jq >/dev/null 2>&1; then jq empty "$HERDR_APP_HOME/layouts/herdr-mods.json"; fi
unset HERDR_APP_HOME XDG_CONFIG_HOME
mkdir -p "$tmp/newhome"
HOME="$tmp/newhome" sh "$tmp/repo/scripts/install.sh" >/dev/null
[ -f "$tmp/newhome/.config/herdr-app/layouts/herdr-mods.json" ]
echo 'PASS: unset env, two mods in shared layout, idempotence and backups'
