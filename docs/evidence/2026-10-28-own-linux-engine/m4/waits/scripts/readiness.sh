#!/bin/bash
# The engine-readiness experiment (capture judged by content) on a private display.
# usage: readiness.sh <harness dir> <engine> <name> [extra args...]
set -u
. "$(dirname "$0")/env.sh"
h=$1
engine=$2
name=$3
shift 3
"$T/scripts/private.sh" "$h" "$name" --experiment engine-readiness --cua "$engine" --vendor "$PINNED" "$@"
