#!/bin/sh
# Compatibility alias; use install.sh for all new instructions.
set -eu
dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
exec sh "$dir/install.sh" "$@"
