#!/bin/sh
# Fills in every Layout slot in place, from the Mods' own mod.json declarations.
# Idempotent: identical output is left alone. A first change keeps one .bak.
# Usage: sh scripts/compose-layout.sh <layout.json>
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
layout=${1:?usage: compose-layout.sh <layout.json>}
[ -f "$layout" ] || { echo "compose: no such layout: $layout" >&2; exit 2; }

if [ -n "${HERDR_MODS_MODS_DIR:-}" ]; then mods_dir=$HERDR_MODS_MODS_DIR
elif [ -d "$script_dir/../mods" ]; then mods_dir=$script_dir/../mods
else mods_dir=${HERDR_APP_HOME:-$HOME/.config/herdr-app}/mods; fi

tmp=$(mktemp "${TMPDIR:-/tmp}/compose.XXXXXX")
trap 'rm -f "$tmp"' EXIT

awk -v mods="$mods_dir" -f "$script_dir/compose-layout.awk" "$layout" > "$tmp"
cmp -s "$layout" "$tmp" && exit 0
[ -f "$layout.bak" ] || cp "$layout" "$layout.bak"
cat "$tmp" > "$layout"
