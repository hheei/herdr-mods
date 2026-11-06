#!/bin/sh
# node --check on a .js file containing import/export parses it as CommonJS and
# silently passes, so a syntax error in a Mod would reach CI green. Checking a
# copy named .mjs parses it as the module it is.
set -eu
repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
for file in "$@"; do
  name=$(basename "$file")
  cp "$repo/$file" "$tmp/$name.mjs"
  node --check "$tmp/$name.mjs"
  printf '  ok %s\n' "$file"
done
