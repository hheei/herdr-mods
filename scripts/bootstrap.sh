#!/bin/sh
# One-line installer: fetch source archive, install project-open, clean up.
set -eu
archive_url=${HERDR_MODS_ARCHIVE_URL:-https://github.com/hheei/herdr-mods/archive/refs/heads/main.tar.gz}
command -v curl >/dev/null 2>&1 || { echo "curl is required" >&2; exit 1; }
command -v tar >/dev/null 2>&1 || { echo "tar is required" >&2; exit 1; }
tmp=$(mktemp -d) || exit 1
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
curl -fLsS "$archive_url" -o "$tmp/source.tar.gz"
mkdir -p "$tmp/extracted"
tar -xzf "$tmp/source.tar.gz" -C "$tmp/extracted"
installer="$tmp/extracted/herdr-mods-main/scripts/install.sh"
[ -f "$installer" ] || { echo "Unexpected source archive" >&2; exit 1; }
sh "$installer" project-open
