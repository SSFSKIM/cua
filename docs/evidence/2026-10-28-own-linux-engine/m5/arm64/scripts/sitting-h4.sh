#!/bin/bash
# Task 99 (T7 part 2, at H''''): the counted :0 sitting, V1-V5 and Z0, started when the class-A driver has finished
# (its "driver done" line, or its stop), into the H'''' out root. It reads the preconditions, then runs the sitting in
# one hold of the host lock (sitting-locked.sh; CUA_LOCK_MAX=330m, six steps at most 55 min each), the hard stop 320
# minutes after the start. The commands are gate.mjs print's at H'''' (zero-commands-h4.txt).
set -u
D=/Users/new/.local/share/cua-171
T=$D/task99
OUT=$D/m5/out-arm64-h4
until grep -qE 'driver done|stopping|REFUSED|stopped' "$OUT/driver.log"; do sleep 30; done
if ! grep -q 'driver done: D1 D2 S1 H1 H2' "$OUT/driver.log"; then echo "$(date -u +%FT%TZ) the class-A driver did not finish: sitting not started" | tee -a "$OUT/zero.log"; exit 3; fi
"$T/precheck-zero-h4.sh" > "$T/zero-precheck-h4.out" 2>&1
hs=$(( $(date +%s) + 320 * 60 ))
echo "hard stop $(date -u -d @"$hs" +%FT%TZ)" >> "$T/zero-precheck-h4.out"
exec "$T/sitting-locked.sh" 330m "$hs" -h4 "$OUT" pinned-release V1:40 V2:39 V3:35 V4:34 V5:38 Z0:25
