#!/bin/bash
# Task 109: one :0 sitting. It reads the preconditions (precheck-zero.sh), then runs the sitting in one hold of the host
# lock (sitting-locked.sh; CUA_LOCK_MAX 330m, six steps at most 55 min each), the hard stop 320 minutes after the start.
#   run-sitting.sh counted     V1 V2 V3 V4 Z0 V5 at H5, counted, into m5/out-arm64-h5 (zero-commands.txt)
#   run-sitting.sh f2          F2's :0 parts, development runs: V2, V3, V5 on current stable Chrome (CHROME_BIN first on
#                              PATH), into m5/f2-arm64-h5 (zero-commands-f2.txt, printed with --dev)
#   run-sitting.sh f3          F3, development runs: V2, V3 with the vendor's third build 26.1111.21308 as --newest,
#                              into m5/f3-arm64-h5 (zero-commands-f3.txt, printed with --dev --newest)
set -u
D=/Users/new/.local/share/cua-171
T=$D/task109
case "$1" in
  counted) suffix=""; OUT=$D/m5/out-arm64-h5; LABEL=pinned-release; STEPS=(V1:40 V2:39 V3:35 V4:34 Z0:25 V5:38) ;;
  # V5 rerun whole at H5 after the controller's clearance of the stopped attempt (ruling 730(b), 11:40Z), in a new hold
  v5) suffix=-v5r; OUT=$D/m5/out-arm64-h5; LABEL=pinned-release; STEPS=(V5:38) ;;
  f2) suffix=-f2; OUT=$D/m5/f2-arm64-h5; LABEL=development-run; STEPS=(V2:39 V3:35 V5:38)
      export CHROME_BIN=$D/chrome-stable/$(cat "$D/chrome-stable/current")/bin ;;
  f3) suffix=-f3; OUT=$D/m5/f3-arm64-h5; LABEL=development-run; STEPS=(V2:39 V3:35) ;;
  *) echo "usage: run-sitting.sh counted|v5|f2|f3"; exit 2 ;;
esac
mkdir -p "$OUT"
"$T/precheck-zero.sh" > "$T/zero-precheck$suffix.out" 2>&1
grep -q '^hold-sittings: absent' "$T/zero-precheck$suffix.out" || { echo "$(date -u +%FT%TZ) hold-sittings present at the pre-check: not started" | tee -a "$OUT/zero.log"; exit 5; }
hs=$(( $(date +%s) + 320 * 60 ))
echo "hard stop $(date -u -d @"$hs" +%FT%TZ)" >> "$T/zero-precheck$suffix.out"
exec "$T/sitting-locked.sh" 330m "$hs" "$suffix" "$OUT" "$LABEL" "${STEPS[@]}"
