#!/bin/bash
# Task 99 (T7, ruling 872, the precise rerun): the activation experiment, a development run on the pinned release (--pinned --pilot:
# gate pinned-dev, never counted), at twice the gate's load, under the host lock (holder t7-arm64), capped at 45 min,
# on the 0.4.1 acceptance home's engine. Its cwd is the H'''' checkout (the pinned rule reads the checkout there).
# usage: activation-872.sh <out dir> <run name> [extra args, e.g. --family gedit --trials 2]
set -u
D=/Users/new/.local/share/cua-171
T=$D/task99
out=$1; run=$2; shift 2
export PATH=$D/node24/bin:$PATH
[ -e "$D/hold-sittings" ] && { echo "hold-sittings present"; exit 5; }
cd /Users/new/Developer/GitHub/cua/.claude/worktrees/t7-h4 || exit 2
CUA_LOCK_MAX=50m "$D/locked.sh" t7-arm64 timeout -s TERM -k 120 45m node "$T/activation-872b.mjs" --cua "$D/m5/home-arm64-041/engine/linux/cua-engine" --pinned --pilot --load-factor 2 --out "$out" --run "$run" "$@"
