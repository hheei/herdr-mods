#!/bin/sh
set -eu
repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
export HERDR_APP_HOME="$tmp/herdr-home"
sh "$repo/scripts/install.sh"
test -f "$HERDR_APP_HOME/mods/project-open/main.js"
test -f "$HERDR_APP_HOME/layouts/project-open.json"
if sh "$repo/scripts/install.sh" >"$tmp/out" 2>&1; then echo "FAIL: overwrote existing mod" >&2; exit 1; fi
printf '%s\n' 'customized-layout-marker' >> "$HERDR_APP_HOME/layouts/project-open.json"
sh "$repo/scripts/install.sh" --update
grep -q 'customized-layout-marker' "$HERDR_APP_HOME/layouts/project-open.json"
backup_count=$(find "$HERDR_APP_HOME/mods" -maxdepth 1 -name 'project-open.bak-*' | wc -l | tr -d ' ')
test "$backup_count" -ge 1
echo "PASS: shell installer, overwrite protection, backup and layout preservation"
