#!/bin/sh
set -eu

operation=${1:?usage: manage.sh status|apply MACHINE [KIND ID AGENT ACTION]}
machine=${2:?select a remote Workspace}
if [ "${AGENT_MANAGER_TEST:-}" != 1 ]; then
  [ "$(uname -s)" = Darwin ] || { echo 'Run Agent Manager on the Mac hosting Herdr App' >&2; exit 2; }
fi
command -v hc >/dev/null || { echo 'Herdr CLI (hc) not found' >&2; exit 2; }
helper=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)/remote.py
code=$(cat "$helper")

if [ "$operation" = inventory ]; then
  [ "$#" -eq 2 ] || exit 2
  hc exec --on "$machine" --timeout 60 python3 -c "$code" inventory
  exit
fi
if [ "$operation" = status ]; then
  [ "$#" -eq 2 ] || [ "$#" -eq 3 ] || exit 2
  if [ "$#" -eq 3 ]; then
    hc exec --on "$machine" --timeout 60 python3 -c "$code" status "$3"
  else
    hc exec --on "$machine" --timeout 60 python3 -c "$code" status
  fi
  exit
fi
if [ "$operation" = read ] || [ "$operation" = delete ]; then
  [ "$#" -eq 4 ] || { [ "$operation" = delete ] && [ "$#" -eq 5 ]; } || exit 2
  if [ "$#" -eq 5 ]; then
    case "$5" in /*) ;; *) echo 'Workspace must be an absolute remote path' >&2; exit 2 ;; esac
    hc exec --on "$machine" --timeout 120 python3 -c "$code" delete "$3" "$4" "$5"
  else
    hc exec --on "$machine" --timeout 120 python3 -c "$code" "$operation" "$3" "$4"
  fi
  exit
fi
if [ "$operation" = import ]; then
  [ "$#" -eq 4 ] || [ "$#" -eq 5 ] || exit 2
  id=$3 agent=$4 project=${5:-}
  case "$agent" in
    shared) [ -n "$project" ] || { echo 'Shared Skills require a Workspace' >&2; exit 2; } ;;
    agy) [ -z "$project" ] || { echo 'Project Skills do not support Antigravity' >&2; exit 2; } ;;
    claude|codex|pi) ;;
    *) echo 'Unknown Skill agent' >&2; exit 2 ;;
  esac
  if [ -n "$project" ]; then
    case "$project" in /*) ;; *) echo 'Workspace must be an absolute remote path' >&2; exit 2 ;; esac
    hc exec --on "$machine" --timeout 120 python3 -c "$code" import "$agent" "$id" "$project"
  else
    hc exec --on "$machine" --timeout 120 python3 -c "$code" import "$agent" "$id"
  fi
  exit
fi
[ "$operation" = apply ] && { [ "$#" -eq 6 ] || [ "$#" -eq 7 ] || [ "$#" -eq 8 ]; } || { echo 'usage: manage.sh apply MACHINE KIND ID AGENT ACTION [WORKSPACE] [METHOD]' >&2; exit 2; }
kind=$3 id=$4 agent=$5 action=$6
project=${7:-}
method=${8:-}
if [ "$project" = - ]; then project=; fi
if [ -n "$method" ]; then
  [ "$kind:$action:$method" = skills:enable:link ] || [ "$kind:$action:$method" = skills:enable:copy ] || { echo 'Invalid Skill deployment method' >&2; exit 2; }
fi
if [ -n "$project" ]; then
  case "$project" in /*) ;; *) echo 'Workspace must be an absolute remote path' >&2; exit 2 ;; esac
fi
case "$kind:$agent:$action" in
  mcp:claude:enable|mcp:claude:disable|mcp:codex:enable|mcp:codex:disable|mcp:pi:enable|mcp:pi:disable|mcp:agy:enable|mcp:agy:disable|skills:shared:enable|skills:shared:disable|skills:claude:enable|skills:claude:disable|skills:codex:enable|skills:codex:disable|skills:pi:enable|skills:pi:disable|skills:agy:enable|skills:agy:disable|skills:claude:adopt|skills:codex:adopt|skills:pi:adopt|skills:agy:adopt) ;;
  *) echo 'Unsupported resource, Agent or action' >&2; exit 2 ;;
esac
if [ "$kind:$agent" = skills:shared ] && [ -z "$project" ]; then
  echo 'Shared Skills require an absolute Workspace' >&2; exit 2
fi
if [ "$kind:$agent" = skills:agy ] && [ -n "$project" ]; then
  echo 'Project Skills do not support Antigravity' >&2; exit 2
fi
if [ "$action" = adopt ] && [ -n "$project" ]; then
  echo 'Skill adoption is Global only' >&2; exit 2
fi
if [ "$kind:$id" = mcp:node_repl ]; then
  echo 'node_repl is excluded from Agent Manager' >&2; exit 2
fi
case "$id" in
  ''|.|..|*[!a-zA-Z0-9_.-]*) echo 'Unsupported resource id' >&2; exit 2 ;;
esac
remote_payload=-
remote_dir=
tmp=
cleanup() {
  [ -z "$tmp" ] || rm -rf "$tmp"
  if [ -n "$remote_dir" ]; then
    hc exec --on "$machine" rm -rf "$remote_dir" >/dev/null 2>&1 || :
  fi
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
if [ "$kind" = mcp ] && [ "$action" = enable ]; then
  db=${AGENT_MANAGER_TEST_DB:-$HOME/.cc-switch/cc-switch.db}
  [ -f "$db" ] && [ ! -L "$db" ] || { echo 'Local CC Switch database missing or linked' >&2; exit 2; }
  tmp=$(mktemp -d)
  sqlite3 -readonly -json "$db" "SELECT name,server_config FROM mcp_servers WHERE id = '$id'" > "$tmp/definition.json"
  remote_dir=$(hc exec --on "$machine" mktemp -d /tmp/agent-manager-mcp.XXXXXX)
  if ! printf '%s\n' "$remote_dir" | grep -Eq '^/tmp/agent-manager-mcp\.[A-Za-z0-9]{6}$'; then
    remote_dir=
    echo 'Cannot allocate private remote payload directory' >&2
    exit 1
  fi
  remote_payload=$remote_dir/payload.json
  hc file write --on "$machine" "$remote_payload" < "$tmp/definition.json" > /dev/null
  hc exec --on "$machine" chmod 600 "$remote_payload"
fi
if [ -n "$method" ]; then
  hc exec --on "$machine" --timeout 120 python3 -c "$code" apply "$kind" "$agent" "$action" "$id" "$remote_payload" "${project:--}" "$method"
elif [ -n "$project" ]; then
  hc exec --on "$machine" --timeout 120 python3 -c "$code" apply "$kind" "$agent" "$action" "$id" "$remote_payload" "$project"
else
  hc exec --on "$machine" --timeout 120 python3 -c "$code" apply "$kind" "$agent" "$action" "$id" "$remote_payload"
fi
