#!/bin/bash
# Task 89: F3's unjudged lane on :0 on its GO: V2 then V3 as development runs with the vendor's third build
# (26.1111.21308) as --newest, into m5/f3-out-x64. Waits for the twice-load driver's end (F4) and for 10:00Z on 11-17,
# reads the preconditions, and starts the sitting in one hold (CUA_LOCK_MAX=95m); the hard stop is the start + 90 min.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task89
OUT=$D/m5/f3-out-x64
until grep -q "driver done: L1\|REFUSED\|stopping before" "$D/m5/out-x64/driver.log"; do sleep 20; done
grep -q "driver done: L1" "$D/m5/out-x64/driver.log" || { echo "$(date -u +%FT%TZ) the twice-load driver did not finish: F3 not started"; exit 3; }
until [ "$(date -u +%s)" -ge "$(date -u -d 2026-11-17T10:00:00Z +%s)" ]; do sleep 20; done
sleep 30
start=$(date -u +%s)
hard=$(( start + 90 * 60 ))
cap=$(date -u -d 2026-11-17T13:00:00Z +%s)   # the architect holds :0 to 13:00Z (sminos 763, 768)
[ "$hard" -gt "$cap" ] && hard=$cap
"$T/precheck-zero.sh" > "$T/zero-precheck-f3.out" 2>&1
echo "hard stop $(date -u -d @"$hard" +%FT%TZ)" >> "$T/zero-precheck-f3.out"
exec "$T/sitting-locked.sh" 95m "$hard" -f3 "$OUT" development-run V2:39 V3:35
