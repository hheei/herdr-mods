#!/bin/sh
# Herdr writes herdr.d.ts and gpui-kit.d.ts for mod authors, but only on a machine
# running the App. A copy in the checkout lets `tsc -p jsconfig.json` check the mods
# anywhere; run this after a Herdr update to move the copy forward.
set -eu
home=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
repo=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
for file in herdr.d.ts gpui-kit.d.ts; do
  cp "$home/$file" "$repo/types/$file"
  printf '  synced %s\n' "$file"
done
