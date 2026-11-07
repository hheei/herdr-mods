# Shared shell UI and paths for the installer and the per-mod wiring hooks.
esc=$(printf '\033')
interactive=no
if [ -t 1 ] && (: </dev/tty) 2>/dev/null; then interactive=yes; fi
if [ -t 1 ]; then
  bold=$esc'[1m' dim=$esc'[2m' good=$esc'[32m' hot=$esc'[33m' bad=$esc'[31m' off=$esc'[0m'
else
  bold= dim= good= hot= bad= off=
fi
layout=herdr-mods
app_home() { printf '%s\n' "${HERDR_APP_HOME:-${XDG_CONFIG_HOME:-$HOME/.config}/herdr-app}"; }
step() { printf '  %s✓%s %s\n' "$good" "$off" "$*"; }
warn() { printf '  %s!%s %s\n' "$hot" "$off" "$*" >&2; }
confirm() {
  [ "${assume_yes:-no}" = yes ] && return 0
  [ "$interactive" = yes ] || return 0
  printf '  %s?%s %s [Y/n] ' "$hot" "$off" "$1"
  answer=''
  read -r answer </dev/tty || return 0
  case "$answer" in [Nn]*) return 1 ;; *) return 0 ;; esac
}
keep_bak() {
  [ -e "$1" ] || [ -L "$1" ] || return 0
  rm -rf "$1.bak"
  mv "$1" "$1.bak"
}

# Swap the personal layout for a patched candidate, keeping one .bak.
# Returns 0 when the layout changed, 1 when the candidate matched it.
commit_layout() {
  layout_dst="$home_dir/layouts/$layout.json"
  if cmp -s "$layout_dst" "$1"; then
    rm -f "$1"
    return 1
  fi
  keep_bak "$layout_dst"
  mv "$1" "$layout_dst"
  [ -z "${2:-}" ] || step "$2"
  return 0
}
