#!/bin/sh
# Install, refresh or scope Herdr mods. Each mod declares its own layout wiring in
# layout.json ("status-bar" | "sidebar" | "derive": "<layout>" | "pi": "<file>"), so this script
# only applies the wiring shapes it knows and no mod by name.
# Checkout: sh scripts/install.sh [mod...] [--all] [--no-layout]
# Piped:    curl -fsSL .../install.sh | sh -s -- --all
set -eu
no_layout=no
install_all=no
named=''
for arg do
  case "$arg" in
    --all) install_all=yes ;;
    --no-layout) no_layout=yes ;;
    -h|--help) echo 'usage: install.sh [mod...] [--all] [--no-layout]'; exit 0 ;;
    -*) echo "install: unknown option: $arg" >&2; exit 2 ;;
    *) named="$named $arg" ;;
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
home_dir=$(app_home)
# What is installed is what sits in the App Home already: no bookkeeping of our own,
# and nothing of ours in Herdr's folder. A named Mod always wins; --all means every
# Mod in this checkout; otherwise this refreshes only what is already there.
mods=''
if [ -n "$named" ]; then
  mods=$named
elif [ "$install_all" = yes ]; then
  for dir in "$repo_dir"/mods/*/; do mods="$mods $(basename "$dir")"; done
else
  for dir in "$home_dir"/mods/*/; do
    [ -d "$dir" ] || continue
    name=$(basename "$dir")
    [ -f "$repo_dir/mods/$name/main.js" ] || continue
    mods="$mods $name"
  done
fi
if [ -z "$mods" ]; then
  warn "nothing installed yet: name a mod, or pass --all"
  exit 0
fi
printf '\n  %sherdr-mods%s %s·%s%s\n\n' "$bold" "$off" "$dim" "$off" "$mods"
mkdir -p "$home_dir/mods"
# A backup inside mods/ becomes a Mod to Herdr, which then fails to load it, so
# replaced mods go to backups/ instead. Layout .bak files stay beside the layout
# they replace: Herdr only reads *.json there.
backup_dir="$home_dir/backups"
for mod in $mods; do
  src="$repo_dir/mods/$mod"
  [ -f "$src/main.js" ] || { printf '  %s✗%s unknown mod: %s\n' "$bad" "$off" "$mod" >&2; exit 1; }
  dst="$home_dir/mods/$mod"
  # layout.json is the user's answer to "does this Mod belong in the bar": keep the
  # one already there instead of overwriting it with this checkout's default.
  keep=""
  if [ -f "$dst/layout.json" ]; then
    keep="$(dirname -- "$src")/.layout.$$.json"
    cp "$dst/layout.json" "$keep"
  fi
  if [ -e "$dst" ]; then
    verb=updated
    mkdir -p "$backup_dir"
    rm -rf "$backup_dir/$mod"
    mv "$dst" "$backup_dir/$mod"
  else
    verb=installed
  fi
  cp -R "$src" "$dst"
  if [ -n "$keep" ]; then
    cp "$keep" "$dst/layout.json"
    rm -f "$keep"
  fi
  step "mod $verb ${dim}→ $dst${off}"
done
install_kind() {
  decl="$home_dir/mods/$1/layout.json"
  [ -f "$decl" ] || return 0
  grep -q '"status-bar"' "$decl" && printf 'status '
  grep -q '"sidebar"' "$decl" && printf 'sidebar '
  sed -n 's/.*"derive"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/derive:\1/p' "$decl"
  sed -n 's/.*"pi"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/pi:\1/p' "$decl"
  return 0
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
  patched=yes
  case "$kind" in
    status)
      awk -f "$script_dir/patch-status.awk" "$layout_dst" > "$tmp" 2>/dev/null || cp "$layout_dst" "$tmp"
      # Which Mods sit in the bar is each Mod's own layout.json decision, so this
      # runs even when nothing needed patching: a Mod that asks for the bar joins
      # on its own, and adding one never means editing a Layout by hand.
      awk -v mods="$home_dir/mods" -f "$script_dir/compose-layout.awk" "$tmp" > "$tmp.slot" || patched=no
      mv "$tmp.slot" "$tmp"
      ;;
    sidebar) awk -v name="$mod" -f "$script_dir/patch-sidebar.awk" "$layout_dst" > "$tmp" 2>/dev/null || { patched=no; cp "$layout_dst" "$tmp"; } ;;
  esac
  if cmp -s "$layout_dst" "$tmp"; then
    rm -f "$tmp"
    [ "$patched" = yes ] || warn "layout left unchanged; wire $mod by hand (mods/$mod/README.md)"
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
  for kind in $(install_kind "$mod"); do
    case "$kind" in
      pi:*) wire_pi "$mod" "${kind#pi:}" ;;
    esac
  done
done
if [ "$no_layout" = yes ]; then
  warn "layout untouched (--no-layout); wire the mods by hand"
else
  # Every status/sidebar patch lands before any derived layout is copied: a
  # derived layout must inherit the already-wired base, not the shipped one.
  wired=no
  for mod in $mods; do
    for kind in $(install_kind "$mod"); do
      case "$kind" in
        status|sidebar) wire_personal "$mod" "$kind"; wired=yes ;;
      esac
    done
  done
  for mod in $mods; do
    for kind in $(install_kind "$mod"); do
      case "$kind" in
        derive:*) wire_derive "$mod" "${kind#derive:}"; wired=yes ;;
      esac
    done
  done
  [ "$wired" = yes ] || warn "no layout wiring in$mods; see the mod README"
fi
