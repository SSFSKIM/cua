#!/bin/bash
# Task 123, ruling 950: the activation measurement, a development run (--pinned --pilot: never counted), at twice the
# gate's load, on a private display, under the host lock (holder task123-x64), capped at 45 min. --cua is the H6 run
# home's pinned 0.4.2; --cua-old is the H⁗ home's 0.4.1 (each checked against its pin by a950.mjs). The cwd is the H6
# checkout, whose pinned rule the runner reads.
# usage: a950.sh <out dir> <run name> [extra args, e.g. --runs 2]
set -u
D=/Users/new/.local/share/cua-171
T=$D/task123/a950
out=$1; run=$2; shift 2
[ -e "$D/hold-sittings" ] && { echo "hold-sittings present"; exit 5; }
free=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
[ "$free" -gt 20 ] || { echo "only ${free}G free (ruling 937)"; exit 9; }
cd /Users/new/Developer/GitHub/cua/.claude/worktrees/t123-x64 || exit 2
CUA_LOCK_MAX=50m "$D/locked.sh" task123-x64 timeout -s TERM -k 120 45m node "$T/a950.mjs" \
  --cua "$D/m5/home-x64-042/engine/linux/cua-engine" --cua-old "$D/m5/home-x64-041/engine/linux/cua-engine" \
  --pinned --pilot --load-factor 2 --out "$out" --run "$run" "$@"
