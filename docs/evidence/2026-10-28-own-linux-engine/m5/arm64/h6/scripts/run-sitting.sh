#!/bin/bash
# Task 122 (from task 109's): arm64's :0 sitting at H6, V5 alone, counted. It reads the preconditions (precheck-zero.sh)
# and the disk (ruling 937: with 20G or less free on / it does not start), then runs the sitting in one hold of the host
# lock (sitting-locked.sh; CUA_LOCK_MAX 70m: V5's 55-minute cap plus its after-step reading), the hard stop 60 minutes
# after the start.
#   run-sitting.sh counted     V5 at H6, counted, into m5/out-arm64-h6 (zero-commands.txt)
#   run-sitting.sh v5r         V5 rerun whole, only once the controller has cleared a stop (zero-commands-v5r.txt)
set -u
D=/Users/new/.local/share/cua-171
T=$D/task122
case "$1" in
  counted) suffix=""; OUT=$D/m5/out-arm64-h6; LABEL=pinned-release; STEPS=(V5:38) ;;
  v5r) suffix=-v5r; OUT=$D/m5/out-arm64-h6; LABEL=pinned-release; STEPS=(V5:38) ;;
  *) echo "usage: run-sitting.sh counted|v5r"; exit 2 ;;
esac
mkdir -p "$OUT"
"$T/precheck-zero.sh" > "$T/zero-precheck$suffix.out" 2>&1
grep -q '^hold-sittings: absent' "$T/zero-precheck$suffix.out" || { echo "$(date -u +%FT%TZ) hold-sittings present at the pre-check: not started" | tee -a "$OUT/zero.log"; exit 5; }
f=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
echo "df / avail ${f}G" >> "$T/zero-precheck$suffix.out"
[ "$f" -le 20 ] && { echo "$(date -u +%FT%TZ) disk: ${f}G free on /, 20G or less (ruling 937): not started" | tee -a "$OUT/zero.log"; exit 9; }
hs=$(( $(date +%s) + 60 * 60 ))
echo "hard stop $(date -u -d @"$hs" +%FT%TZ)" >> "$T/zero-precheck$suffix.out"
exec "$T/sitting-locked.sh" 70m "$hs" "$suffix" "$OUT" "$LABEL" "${STEPS[@]}"
