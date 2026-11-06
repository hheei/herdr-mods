#!/bin/sh
# Install or refresh Herdr mods. Each mod declares its own layout wiring in
# mod.json ("install": "status" | "sidebar" | "derive:<layout>" | "pi:<file>"), so this script
# only applies the wiring shapes it knows and no mod by name.
# Checkout: sh scripts/install.sh [mod...] [--no-layout]
# Piped:    curl -fsSL .../install.sh | sh
set -eu
no_layout=no
mods=''
for arg do
  case "$arg" in
    --no-layout) no_layout=yes ;;
    -h|--help) echo 'usage: install.sh [mod...] [--no-layout]'; exit 0 ;;
    -*) echo "install: unknown option: $arg" >&2; exit 2 ;;
    *) mods="$mods $arg" ;;
  esac
done
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
repo_dir=$(dirname "$script_dir")
# Piped one-liner: no checkout around us, so stage the source archive instead.
if [ ! -f "$script_dir/patch-status.awk" ]; then
  stage=$(mktemp -d)
  trap 'rm -rf "$stage"' EXIT HUP INT TERM
  printf '  fetching herdr-mods\n'
  curl -fLsS "${HERDR_MODS_ARCHIVE_URL:-https://github.com/hheei/herdr-mods/archive/refs/heads/main.tar.gz}" -o "$stage/src.tgz"
  tar -xzf "$stage/src.tgz" -C "$stage"
  sh "$stage/herdr-mods-main/scripts/install.sh" "$@"
  exit 0
fi
. "$script_dir/tui.sh"
if [ -z "$mods" ]; then
  for dir in "$repo_dir"/mods/*/; do mods="$mods $(basename "$dir")"; done
fi
home_dir=$(app_home)
printf '\n  %sherdr-mods%s %s·%s%s\n\n' "$bold" "$off" "$dim" "$off" "$mods"
mkdir -p "$home_dir/mods"
for mod in $mods; do
  src="$repo_dir/mods/$mod"
  [ -f "$src/main.js" ] || { printf '  %s✗%s unknown mod: %s\n' "$bad" "$off" "$mod" >&2; exit 1; }
  dst="$home_dir/mods/$mod"
  if [ -e "$dst" ]; then
    verb=updated
    keep_bak "$dst"
  else
    verb=installed
  fi
  cp -R "$src" "$dst"
  step "mod $verb ${dim}→ $dst${off}"
done
install_kind() {
  sed -n 's/.*"install"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$home_dir/mods/$1/mod.json"
}
wire_personal() {
  mod=$1 kind=$2
  mkdir -p "$home_dir/layouts"
  layout_dst="$home_dir/layouts/$layout.json"
  created=no
  if [ ! -f "$layout_dst" ]; then
    base="$home_dir/layouts/main.json"
    [ -f "$base" ] || base="$repo_dir/layouts/$layout.json"
    cp "$base" "$layout_dst"
    created=yes
  fi
  tmp="$layout_dst.tmp.$$"
  trap 'rm -f "$tmp"' EXIT HUP INT TERM
  case "$kind" in
    status) awk -f "$script_dir/patch-status.awk" "$layout_dst" > "$tmp" 2>/dev/null || patched=no ;;
    sidebar) awk -v name="$mod" -f "$script_dir/patch-sidebar.awk" "$layout_dst" > "$tmp" 2>/dev/null || patched=no ;;
  esac
  if [ "${patched:-yes}" = no ] || cmp -s "$layout_dst" "$tmp"; then
    rm -f "$tmp"
    [ "${patched:-yes}" = no ] && warn "layout left unchanged; wire $mod by hand (mods/$mod/README.md)"
    return 0
  fi
  if confirm "patch layout $layout"; then
    commit_layout "$tmp" "layout $layout patched ${dim}(backup: $layout.json.bak)${off}" || true
    printf '  %s→%s switch Herdr App to layout %s%s%s  %s·  herdr-app check "%s"\n\n' \
      "$dim" "$off" "$bold" "$layout" "$off" "$dim" "$home_dir/mods/$mod"
  else
    rm -f "$tmp"
    [ "$created" = no ] || rm -f "$layout_dst"
    warn "layout left unchanged; wire $mod by hand (mods/$mod/README.md)"
  fi
}
wire_derive() {
  mod=$1 name=$2
  mkdir -p "$home_dir/layouts"
  base="$home_dir/layouts/$layout.json"
  [ -f "$base" ] || base="$repo_dir/layouts/$layout.json"
  target="$home_dir/layouts/$name.json"
  tmp="$target.tmp.$$"
  trap 'rm -f "$tmp"' EXIT HUP INT TERM
  if awk -v prefix="$name" -v mod="$mod" -f "$script_dir/demo-layout.awk" "$base" > "$tmp"; then
    keep_bak "$target"
    mv "$tmp" "$target"
    step "layout $name ${dim}→ $target${off}"
    printf '  %s→%s switch Herdr App to layout %s%s%s  %s·  preview only: hides the active tab view, never stops the process%s\n\n' \
      "$dim" "$off" "$bold" "$name" "$off" "$dim" "$off"
  else
    warn "layout $name left unchanged: $base has a customized work-body"
  fi
}
wire_pi() {
  mod=$1 file=$2
  src="$repo_dir/mods/$mod/bridge/$file"
  dst="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/extensions/$file"
  mkdir -p "$(dirname "$dst")"
  if [ -e "$dst" ]; then
    keep_bak "$dst"
    verb=updated
  else
    verb=installed
  fi
  cp "$src" "$dst"
  step "extension $verb ${dim}→ $dst${off}"
}
for mod in $mods; do
  kind=$(install_kind "$mod")
  case "$kind" in
    *pi:*) wire_pi "$mod" "${kind##*pi:}" ;;
  esac
done
if [ "$no_layout" = yes ]; then
  warn "layout untouched (--no-layout); wire the mods by hand"
else
  # Every status/sidebar patch lands before any derived layout is copied: a
  # derived layout must inherit the already-wired base, not the shipped one.
  wired=no
  for mod in $mods; do
    for kind in $(install_kind "$mod" | tr ',' ' '); do
      case "$kind" in
        status|sidebar) wire_personal "$mod" "$kind"; wired=yes ;;
      esac
    done
  done
  for mod in $mods; do
    for kind in $(install_kind "$mod" | tr ',' ' '); do
      case "$kind" in
        derive:*) wire_derive "$mod" "${kind#derive:}"; wired=yes ;;
      esac
    done
  done
  [ "$wired" = yes ] || warn "no layout wiring in$mods; see the mod README"
fi
