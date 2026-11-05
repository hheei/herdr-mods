#!/bin/sh
# Install or refresh a Herdr mod and patch the shared personal layout.
# Checkout: sh scripts/install.sh [mod] [--no-layout]
# Piped:    curl -fsSL .../install.sh | sh
set -eu
mod=project-open
no_layout=no
layout=herdr-mods
for arg do
  case "$arg" in
    --no-layout) no_layout=yes ;;
    -h|--help) echo 'usage: install.sh [mod] [--no-layout]'; exit 0 ;;
    -*) echo "install: unknown option: $arg" >&2; exit 2 ;;
    *) mod=$arg ;;
  esac
done
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
repo_dir=$(dirname "$script_dir")
esc=$(printf '\033')
interactive=no
if [ -t 1 ] && (: </dev/tty) 2>/dev/null; then interactive=yes; fi
if [ -t 1 ]; then
  bold=$esc'[1m' dim=$esc'[2m' good=$esc'[32m' hot=$esc'[33m' bad=$esc'[31m' off=$esc'[0m'
else
  bold= dim= good= hot= bad= off=
fi
step() { printf '  %s✓%s %s\n' "$good" "$off" "$*"; }
confirm() {
  [ "$interactive" = yes ] || return 0
  printf '  %s?%s %s [Y/n] ' "$hot" "$off" "$1"
  answer=''
  read -r answer </dev/tty || return 0
  case "$answer" in [Nn]*) return 1 ;; *) return 0 ;; esac
}
warn() { printf '  %s!%s %s\n' "$hot" "$off" "$*" >&2; }
spin() {
  label=$1; shift
  if [ ! -t 1 ]; then "$@"; return; fi
  "$@" & pid=$!
  while kill -0 "$pid" 2>/dev/null; do
    for f in ⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏; do
      kill -0 "$pid" 2>/dev/null || break
      printf '  %s%s %s%s\r' "$dim" "$f" "$label" "$off"
      sleep 0.1
    done
  done
  printf '%s[K\r' "$esc"
  wait "$pid"
}
# Piped one-liner: no checkout around us, so stage the source archive instead.
if [ ! -f "$script_dir/patch-status.awk" ]; then
  stage=$(mktemp -d)
  trap 'rm -rf "$stage"' EXIT HUP INT TERM
  spin "fetching herdr-mods" curl -fLsS "${HERDR_MODS_ARCHIVE_URL:-https://github.com/hheei/herdr-mods/archive/refs/heads/main.tar.gz}" -o "$stage/src.tgz"
  spin "extracting" tar -xzf "$stage/src.tgz" -C "$stage"
  sh "$stage/herdr-mods-main/scripts/install.sh" "$@"
  exit 0
fi
printf '\n  %sherdr-mods%s %s·%s %s\n\n' "$bold" "$off" "$dim" "$off" "$mod"
src="$repo_dir/mods/$mod"
[ -f "$src/main.js" ] || { printf '  %s✗%s unknown mod: %s\n' "$bad" "$off" "$mod" >&2; exit 1; }
home_dir=${HERDR_APP_HOME:-${XDG_CONFIG_HOME:-$HOME/.config}/herdr-app}
dst="$home_dir/mods/$mod"
layout_dst="$home_dir/layouts/$layout.json"
verb=installed
if [ -e "$dst" ]; then verb=updated; fi
mkdir -p "$home_dir/mods"
if [ "$no_layout" = no ]; then
  mkdir -p "$home_dir/layouts"
  # Never modify Herdr's shipped layout. First installation copies it to a
  # reusable personal layout; all subsequent mods patch the same copy.
  created=no
  if [ ! -f "$layout_dst" ]; then
    base="$home_dir/layouts/main.json"
    [ -f "$base" ] || base="$repo_dir/layouts/herdr-mods.json"
    cp "$base" "$layout_dst"
    created=yes
  fi
  tmp="$layout_dst.tmp.$$"
  trap 'rm -f "$tmp"' EXIT HUP INT TERM
  patched=no
  layout_ready=no
  if [ "$mod" = project-open ]; then
    if awk -f "$script_dir/patch-status.awk" "$layout_dst" > "$tmp"; then patched=yes; fi
  elif ! grep -Eq "\"id\"[[:space:]]*:[[:space:]]*\"$mod\"" "$layout_dst"; then
    if awk -v name="$mod" '
      { if ($0 ~ /^[[:space:]]*"id"[[:space:]]*:[[:space:]]*"sidebar-footer"/) {
          lead=prev; sub(/\{[[:space:]]*$/, "", lead);
          print lead "{\"id\":\"" name "\",\"type\":\"block\",\"size\":{\"px\":38},\"content\":{\"mod\":\"" name "\"}},";
          count++;
        }
        if (NR>1) print prev; prev=$0;
      }
      END {
        print prev
        if (count!=1) { print "No sidebar-footer in layout; layout left unchanged." > "/dev/stderr"; exit 3 }
      }
    ' "$layout_dst" > "$tmp"; then patched=yes; fi
  fi
  if [ "$patched" = yes ] && ! cmp -s "$layout_dst" "$tmp"; then
    if confirm "patch layout $layout"; then
      cp -f "$layout_dst" "$layout_dst.bak"
      mv "$tmp" "$layout_dst"
      layout_ready=yes
      step "layout $layout patched ${dim}(backup: $layout.json.bak)${off}"
    else
      if [ "$created" = yes ]; then rm -f "$layout_dst"; fi
      warn "layout left unchanged; patch it by hand (mods/$mod/README.md)"
    fi
  elif [ "$patched" = no ]; then
    warn "layout left unchanged; add \"$mod\" by hand (mods/$mod/README.md)"
  else
    layout_ready=yes
  fi
fi
if [ "$verb" = updated ]; then
  rm -rf "$dst.bak"
  mv "$dst" "$dst.bak"
fi
cp -R "$src" "$dst"
step "mod $verb ${dim}→ $dst${off}"
if [ "$no_layout" = yes ]; then
  warn "layout untouched (--no-layout); add \"$mod\" by hand"
elif [ "$layout_ready" = yes ]; then
  printf '  %s→%s switch Herdr App to layout %s%s%s  %s·  herdr-app check "%s"%s\n\n' \
    "$dim" "$off" "$bold" "$layout" "$off" "$dim" "$dst" "$off"
fi
