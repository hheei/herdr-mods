#!/bin/sh
# node --check on a .js file containing import/export parses it as CommonJS and
# silently passes, so a syntax error in a Mod would reach CI green. Checking a
# copy named .mjs parses it as the module it is.
set -eu
repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
# No arguments: every Mod file, so a new one is checked without editing a list.
if [ "$#" -eq 0 ]; then set -- $(cd "$repo" && find mods -name '*.js' | sort); fi
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
for file in "$@"; do
  name=$(basename "$file")
  cp "$repo/$file" "$tmp/$name.mjs"
  node --check "$tmp/$name.mjs"
  printf '  ok %s\n' "$file"
done
