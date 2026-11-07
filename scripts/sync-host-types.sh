#!/bin/sh
# Herdr generates herdr.d.ts and gpui-kit.d.ts for mod authors, but only on a machine
# running the App. herdr.d.ts is committed and moves with a visible diff; gpui-kit.d.ts
# is 800 KB of generated registry, gitignored, and only refreshed here. Run after a
# Herdr update.
set -eu
home=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
for file in herdr.d.ts gpui-kit.d.ts; do
  cp "$home/$file" "$repo/types/$file"
  printf '  synced %s\n' "$file"
done
