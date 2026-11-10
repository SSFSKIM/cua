#!/bin/bash
# A drop-signals run on a private display (private.sh), never :0.
# usage: ds.sh <harness dir> <name> <candidate engine path> <more linux-engine-diff.mjs args...>
set -u
d=$(dirname "$0")
. "$d/env.sh"
h=$1
name=$2
cand=$3
shift 3
"$cand" --version
echo "start $(date -u +%FT%TZ) loadavg $(cut -d' ' -f1-3 /proc/loadavg)"
"$d/private.sh" "$h" "$name" --experiment drop-signals --cua "$cand" --run "t69-$name" "$@"
echo "end $(date -u +%FT%TZ) loadavg $(cut -d' ' -f1-3 /proc/loadavg)"
