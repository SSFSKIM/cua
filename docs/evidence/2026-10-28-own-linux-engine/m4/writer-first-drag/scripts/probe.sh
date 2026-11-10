#!/bin/bash
# T16's Writer probe (`--experiment writer-drag`, scripts/linux-engine-diff/writer-drag.mjs) on a private display
# (private.sh, beside this script): the pinned build beside the candidate, the engine binary's path as build-musl.sh
# prints it last. Exits with the run's status.
# usage: probe.sh <harness dir> <name> <candidate> <more linux-engine-diff.mjs args...>   (--plan, --trials, --variant)
set -u
. "$(dirname "$0")/env.sh"
h=$1
name=$2
cand=$3
shift 3
exec "$S/private.sh" "$h" "$name" --experiment writer-drag --vendor "$PINNED" --cua "$cand" --run "t72-$name" "$@"
