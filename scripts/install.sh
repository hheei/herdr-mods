#!/bin/sh
# Install, refresh or scope Herdr mods. Each mod declares its own layout wiring in
# layout.json ("status" | "tabs" | "panel" | "sidebar" | "pi": "<file>"), so this script
# only applies the wiring shapes it knows and no mod by name.
# Checkout: sh scripts/install.sh [mod...] [--all] [--no-layout] [--yes]
# Piped:    curl -fsSL .../install.sh | sh -s -- --all
set -eu
no_layout=no
install_all=no
assume_yes=no
named=''
for arg do
  case "$arg" in
    --all) install_all=yes ;;
    --no-layout) no_layout=yes ;;
    -y|--yes) assume_yes=yes ;;
    --layout=*) layout="${arg#--layout=}" ;;
    -h|--help) echo 'usage: install.sh [mod...] [--all] [--layout=NAME] [--no-layout] [--yes]'; exit 0 ;;
    -*) echo "install: unknown option: $arg" >&2; exit 2 ;;
    *) named="$named $arg" ;;
  esac
done
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
repo_dir=$(dirname "$script_dir")
# Piped one-liner: no checkout around us, so stage the source archive instead.
if [ ! -f "$script_dir/patch-mod.awk" ]; then
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
# One verb: bring what belongs here up to date. What that means is the App Home
# already -- no bookkeeping file of ours, nothing of ours in Herdr's folder. Naming
# Mods narrows it, --all widens it, and with nothing installed there is nothing to
# refresh yet, so the whole checkout is the starting set.
mods=''
if [ -n "$named" ]; then
  mods=$named
else
  if [ "$install_all" = no ]; then
    for dir in "$home_dir"/mods/*/; do
      [ -d "$dir" ] || continue
      name=$(basename "$dir")
      [ -f "$repo_dir/mods/$name/main.js" ] || continue
      mods="$mods $name"
    done
  fi
  if [ "$install_all" = yes ] || [ -z "$mods" ]; then
    mods=''
    for dir in "$repo_dir"/mods/*/; do mods="$mods $(basename "$dir")"; done
  fi
fi
printf '\n  %sherdr-mods%s %s·%s%s\n\n' "$bold" "$off" "$dim" "$off" "$mods"
mkdir -p "$home_dir/mods"
# A backup inside mods/ becomes a Mod to Herdr, which then fails to load it, so
# replaced mods go to backups/ instead. Layout .bak files stay beside the layout
# they replace: Herdr only reads *.json there.
backup_dir="$home_dir/backups"
# layout.json is the user's answer to "does this Mod belong in the bar": whatever is
# installed stays, instead of being overwritten with this checkout's default. Only
# the rest of the folder is compared, so that answer is not mistaken for a change.
layout_kept=""
grab_layout() {
  layout_kept=""
  [ -f "$1/layout.json" ] || return 0
  layout_kept="$(mktemp "${TMPDIR:-/tmp}/herdr-mods-layout.XXXXXX")"
  cp "$1/layout.json" "$layout_kept"
}
restore_layout() {
  [ -z "$layout_kept" ] || { cp "$layout_kept" "$1/layout.json"; rm -f "$layout_kept"; }
}
install_kind() {
  # The installed layout.json wins, because that is the user's answer to what this
  # Mod wires; before the first install there is only this checkout's copy.
  decl="$home_dir/mods/$1/layout.json"
  [ -f "$decl" ] || decl="$repo_dir/mods/$1/layout.json"
  [ -f "$decl" ] || return 0
  sed -n 's/.*"status"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/status:\1/p' "$decl"
  sed -n 's/.*"tabs"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/tabs:\1/p' "$decl"
  grep -q '"sidebar"' "$decl" && printf 'sidebar '
  grep -q '"panel"' "$decl" && printf 'panel '
  sed -n 's/.*"pi"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/pi:\1/p' "$decl"
  return 0
}
mods_todo=''
for mod in $mods; do
  src="$repo_dir/mods/$mod"
  [ -f "$src/main.js" ] || { printf '  %s✗%s unknown mod: %s\n' "$bad" "$off" "$mod" >&2; exit 1; }
  dst="$home_dir/mods/$mod"
  if [ -e "$dst" ] && diff -r -q -x layout.json "$src" "$dst" >/dev/null 2>&1; then
    step "mod unchanged ${dim}→ $dst${off}"
  else
    mods_todo="$mods_todo $mod"
  fi
done
# Extensions are compared byte for byte: a re-run after an upstream change is a
# change, a re-run with nothing new is not.
pi_todo=''
for mod in $mods; do
  for kind in $(install_kind "$mod"); do
    case "$kind" in
      pi:*)
        file="${kind#pi:}"
        src="$repo_dir/mods/$mod/bridge/$file"
        dst="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/extensions/$file"
        if [ -e "$dst" ] && cmp -s "$src" "$dst"; then
          step "extension unchanged ${dim}→ $dst${off}"
        else
          pi_todo="$pi_todo $mod:$file"
        fi
        ;;
    esac
  done
done
changes=$(printf '%s %s' "$mods_todo" "$pi_todo" | wc -w | tr -d ' ')
if [ "$changes" -gt 0 ]; then
  if ! confirm "apply $changes change(s)"; then
    if [ "$interactive" = yes ]; then
      warn "nothing changed; ${changes} pending"
    else
      warn "nothing changed: ${changes} pending and no terminal to ask, re-run with --yes"
    fi
    exit 1
  fi
  # Already said yes to this run: the layout follows without a second prompt, and
  # --no-layout is how you take the Mods without the wiring.
  assume_yes=yes
fi
for mod in $mods_todo; do
  src="$repo_dir/mods/$mod"
  dst="$home_dir/mods/$mod"
  if [ -e "$dst" ]; then
    verb=updated
    mkdir -p "$backup_dir"
    rm -rf "$backup_dir/$mod"
    grab_layout "$dst" "$src"
    mv "$dst" "$backup_dir/$mod"
  else
    verb=installed
  fi
  cp -R "$src" "$dst"
  restore_layout "$dst"
  step "mod $verb ${dim}→ $dst${off}"
done
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
    # A shipped Mod being replaced: status:<shipped name>, tabs:<shipped name>.
    status:*|tabs:*)
      awk -v from="${kind#*:}" -v to="$mod" -f "$script_dir/patch-mod.awk" "$layout_dst" > "$tmp"
      ;;
    sidebar) awk -v name="$mod" -f "$script_dir/patch-sidebar.awk" "$layout_dst" > "$tmp" 2>/dev/null || { patched=no; cp "$layout_dst" "$tmp"; } ;;
    panel) awk -v mod="$mod" -f "$script_dir/patch-panel.awk" "$layout_dst" > "$tmp" || cp "$layout_dst" "$tmp" ;;
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
for item in $pi_todo; do
  wire_pi "${item%%:*}" "${item#*:}"
done
if [ "$no_layout" = yes ]; then
  warn "layout untouched (--no-layout); wire the mods by hand"
else
  wired=no
  for mod in $mods; do
    for kind in $(install_kind "$mod"); do
      case "$kind" in
        status:*|tabs:*|sidebar|panel) wire_personal "$mod" "$kind"; wired=yes ;;
      esac
    done
  done
  [ "$wired" = yes ] || warn "no layout wiring in$mods; see the mod README"
fi
