#!/bin/sh
# Install a standalone Herdr mod and patch a shared personal layout.
set -eu
mod=project-open
update=no
layout=herdr-mods
for arg do
  case "$arg" in
    --update) update=yes ;;
    --layout=*) layout=${arg#--layout=} ;;
    --help|-h) echo 'Usage: sh scripts/install.sh [mod] [--update] [--layout=personal-layout]'; exit 0 ;;
    -*) echo "Unknown option: $arg" >&2; exit 2 ;;
    *) mod=$arg ;;
  esac
done
case "$mod" in ''|.|..|*[!a-zA-Z0-9_-]*) echo "Invalid mod name: $mod" >&2; exit 2 ;; esac
case "$layout" in ''|.|..|*[!a-zA-Z0-9_-]*) echo "Invalid layout name: $layout" >&2; exit 2 ;; esac
case "$layout" in main|terminals|win98) echo 'Cannot patch an official shipped layout; choose a personal layout.' >&2; exit 2 ;; esac
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
repo_dir=$(dirname "$script_dir")
src="$repo_dir/mods/$mod"
[ -f "$src/main.js" ] && [ -f "$src/mod.json" ] || { echo "Unknown mod: $mod" >&2; exit 1; }
if [ -n "${HERDR_APP_HOME:-}" ]; then
  home_dir=$HERDR_APP_HOME
elif [ -n "${XDG_CONFIG_HOME:-}" ]; then
  home_dir=$XDG_CONFIG_HOME/herdr-app
else
  home_dir=$HOME/.config/herdr-app
fi
dst="$home_dir/mods/$mod"
layout_dst="$home_dir/layouts/$layout.json"
if [ "$update" = no ] && { [ -e "$dst" ] || [ -L "$dst" ]; }; then
  echo "Already installed: $dst (use --update)" >&2; exit 1
fi
mkdir -p "$home_dir/mods" "$home_dir/layouts"
# Never modify Herdr's shipped layout. First installation copies it to a
# reusable personal layout; all subsequent mods patch the same copy.
if [ ! -f "$layout_dst" ]; then
  if [ -e "$layout_dst" ] || [ -L "$layout_dst" ]; then
    echo "Layout is not a regular file: $layout_dst" >&2; exit 1
  fi
  base="$home_dir/layouts/main.json"
  [ -f "$base" ] || base="$repo_dir/layouts/herdr-mods.json"
  [ -f "$base" ] || { echo 'Missing layout template' >&2; exit 1; }
  cp "$base" "$layout_dst"
  echo "Created personal layout: $layout_dst"
fi
# Project Open occupies the right end of the status bar, not the sidebar.
# The patch also migrates older layouts that had it above sidebar-footer.
if [ "$mod" = project-open ]; then
  tmp="$layout_dst.tmp.$$"
  trap 'rm -f "$tmp"' EXIT HUP INT TERM
  if ! awk -f "$script_dir/patch-status.awk" "$layout_dst" > "$tmp"; then
    echo "Unsupported status layout; original left unchanged." >&2
    exit 1
  fi
  if ! cmp -s "$layout_dst" "$tmp"; then
    if command -v jq >/dev/null 2>&1; then
      jq empty "$tmp" || { echo "Invalid patched JSON; original unchanged." >&2; exit 1; }
    fi
    backup="$layout_dst.bak-$(date +%Y%m%d-%H%M%S)-$$"
    cp "$layout_dst" "$backup"
    mv "$tmp" "$layout_dst"
    echo "Backed up layout: $backup"
    echo "Placed $mod at the right end of the status bar."
  else
    echo "Status bar already contains $mod (no duplicate)."
  fi
  trap - EXIT HUP INT TERM
else
  # Other mods use the sidebar. Keep their installations additive.
  if grep -Eq "\"id\"[[:space:]]*:[[:space:]]*\"$mod\"" "$layout_dst"; then
    echo "Layout already contains $mod (no duplicate added)."
  else
    tmp="$layout_dst.tmp.$$"
    trap 'rm -f "$tmp"' EXIT HUP INT TERM
    if ! awk -v name="$mod" '
      { if ($0 ~ /^[[:space:]]*"id"[[:space:]]*:[[:space:]]*"sidebar-footer"/) {
          if (prev !~ /^[[:space:]]*\{[[:space:]]*$/) exit 2;
          lead=prev; sub(/\{[[:space:]]*$/, "", lead);
          print lead "{\"id\":\"" name "\",\"type\":\"block\",\"size\":{\"px\":38},\"content\":{\"mod\":\"" name "\"}},";
          count++;
        }
        if (NR>1) print prev;
        prev=$0;
      }
      END {print prev; if (count!=1) exit 2}
    ' "$layout_dst" > "$tmp"; then
      echo "Sidebar layout format not supported; original untouched." >&2; exit 1
    fi
    if command -v jq >/dev/null 2>&1; then jq empty "$tmp" || exit 1; fi
    backup="$layout_dst.bak-$(date +%Y%m%d-%H%M%S)-$$"
    cp "$layout_dst" "$backup"
    mv "$tmp" "$layout_dst"
    echo "Backed up layout: $backup"
    echo "Patched sidebar for $mod."
    trap - EXIT HUP INT TERM
  fi
fi
if [ "$update" = yes ] && { [ -e "$dst" ] || [ -L "$dst" ]; }; then
  backup="$dst.bak-$(date +%Y%m%d-%H%M%S)-$$"
  mv "$dst" "$backup"
  echo "Backed up mod: $backup"
fi
cp -R "$src" "$dst"
echo "Installed mod: $dst"
echo "Switch Herdr App to personal layout '$layout' once; later mods add to it."
echo "Optional CLI: herdr-app do layout.switch --name $layout"
echo "Validate: herdr-app check \"$dst\""
