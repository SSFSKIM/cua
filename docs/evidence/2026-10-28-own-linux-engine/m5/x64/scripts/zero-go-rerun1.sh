#!/bin/bash
# Task 89: the :0 rerun of V5 and Z0 at H unchanged (rulings 749, 750), on its GO: waits until the earliest start
# (epoch s, $1), reads the preconditions, and starts the sitting in one hold (CUA_LOCK_MAX=95m) into the rerun's own out
# root (run71.sh refuses a step directory whose run/ exists; the first V5 stays as the stopped attempt). The hard stop is
# $2 (epoch s).
set -u
D=/Users/new/.local/share/cua-171
T=$D/task89
OUT=$D/m5/out-x64-rerun1
until [ "$(date -u +%s)" -ge "$1" ]; do sleep 10; done
"$T/precheck-zero.sh" > "$T/zero-precheck-rerun1.out" 2>&1
echo "hard stop $(date -u -d @"$2" +%FT%TZ)" >> "$T/zero-precheck-rerun1.out"
exec "$T/sitting-locked.sh" 95m "$2" -rerun1 "$OUT" pinned-release V5:38 Z0:25
