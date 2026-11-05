#!/bin/sh
# Install a Herdr App mod and optional personal layout. No Python/Node/jq.
set -eu
mod=project-open
update=no
for arg do
  case "$arg" in
    --update) update=yes ;;
    --help|-h) echo "Usage: sh scripts/install.sh [mod-name] [--update]"; exit 0 ;;
    -*) echo "Unknown option: $arg" >&2; exit 2 ;;
    *) mod=$arg ;;
  esac
done
case "$mod" in ""|.|..|*/*|*\\*) echo "Invalid mod: $mod" >&2; exit 2 ;; esac
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
repo_dir=$(dirname "$script_dir")
src="$repo_dir/mods/$mod"
[ -f "$src/main.js" ] && [ -f "$src/mod.json" ] || { echo "Unknown mod: $mod" >&2; exit 1; }
if [ -n "\${HERDR_APP_HOME:-}" ]; then
  home_dir=$HERDR_APP_HOME
elif [ -n "\${XDG_CONFIG_HOME:-}" ]; then
  home_dir=$XDG_CONFIG_HOME/herdr-app
else
  home_dir=$HOME/.config/herdr-app
fi
dst="$home_dir/mods/$mod"
layout_src="$repo_dir/layouts/$mod.json"
layout_dst="$home_dir/layouts/$mod.json"
if [ "$update" = no ]; then
  if [ -e "$dst" ] || [ -L "$dst" ]; then echo "Already installed: $dst (use --update)" >&2; exit 1; fi
  if [ -f "$layout_src" ] && { [ -e "$layout_dst" ] || [ -L "$layout_dst" ]; }; then
    echo "Personal layout exists: $layout_dst (refusing to overwrite)" >&2; exit 1
  fi
fi
mkdir -p "$home_dir/mods" "$home_dir/layouts"
if [ "$update" = yes ] && { [ -e "$dst" ] || [ -L "$dst" ]; }; then
  backup="$dst.bak-$(date +%Y%m%d-%H%M%S)"
  [ ! -e "$backup" ] || { echo "Backup collision: $backup" >&2; exit 1; }
  mv "$dst" "$backup"
  echo "Backed up mod: $backup"
fi
cp -R "$src" "$dst"
echo "Installed mod: $dst"
if [ -f "$layout_src" ]; then
  if [ ! -e "$layout_dst" ] && [ ! -L "$layout_dst" ]; then
    cp "$layout_src" "$layout_dst"
    echo "Installed personal layout: $layout_dst"
  else
    echo "Preserved existing layout: $layout_dst"
  fi
  echo "In Herdr App switch to layout '$mod'."
  echo "Optional CLI: herdr-app do layout.switch --name $mod"
fi
echo "Validate: herdr-app check \"$dst\""
