#!/bin/bash
# Task 89: T5's :0 sitting on its GO (sminos 745): waits for the private idle driver's end (C1) and for 23:30Z, then
# reads the preconditions and starts the sitting in one hold (CUA_LOCK_MAX=255m). The hard stop is the start + 4h15m,
# and never past 04:15Z on 11-17, the end of the window the architect holds :0 for.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task89
OUT=$D/m5/out-x64
until grep -q "driver done\|driver stopped\|REFUSED\|stopping before" "$OUT/driver.log"; do sleep 20; done
grep -q "driver done" "$OUT/driver.log" || { echo "$(date -u +%FT%TZ) the idle driver did not finish: the sitting is not started"; exit 3; }
until [ "$(date -u +%s)" -ge "$(date -u -d 2026-11-16T23:30:00Z +%s)" ]; do sleep 20; done
sleep 30   # the idle step's lock released and its load settled a little
start=$(date -u +%s)
hard=$(( start + 255 * 60 ))
cap=$(date -u -d 2026-11-17T04:15:00Z +%s)
[ "$hard" -gt "$cap" ] && hard=$cap
"$T/precheck-zero.sh" > "$T/zero-precheck.out" 2>&1
echo "hard stop $(date -u -d @"$hard" +%FT%TZ)" >> "$T/zero-precheck.out"
exec "$T/sitting-locked.sh" 255m "$hard" "" "$OUT" pinned-release V1:40 V2:39 V3:35 V4:34 V5:38 Z0:25
