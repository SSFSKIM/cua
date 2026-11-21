#!/bin/bash
# Task 123, ruling 953: the shipped twin (plan t14-long) at H6 on x64, under the host lock (holder task123-x64),
# capped at 45 min, from the H6 checkout. Checks hold-sittings and the free disk (ruling 937) first.
# usage: a953.sh <out dir>
set -u
D=/Users/new/.local/share/cua-171
[ -e "$D/hold-sittings" ] && { echo "hold-sittings present"; exit 5; }
free=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
[ "$free" -gt 20 ] || { echo "only ${free}G free (ruling 937)"; exit 9; }
cd /Users/new/Developer/GitHub/cua/.claude/worktrees/t123-x64 || exit 2
CUA_LOCK_MAX=50m "$D/locked.sh" task123-x64 timeout -s TERM -k 120 45m node "$D/task123/a953/a953.mjs" "$1"
