#!/bin/bash
# Task 129, L4d at H7.1 = 96fa1fd3 (rulings 957, 961, 962, 972, 984, 986): home-x64-042 checked again from t129-x64
# at H7.1 (its own hold of the lock), then `gate.mjs print L4d` (display-free) into commands-l4d.txt, then the printed
# line once, through drive.sh (one hold, released when it ends). Stops on any failure before the step.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task129
OUT=$D/m5/out-x64-h7
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$T/l4d.log"; }
[ -e "$D/hold-sittings" ] && { log "hold-sittings present: stopped"; exit 5; }
"$D/locked.sh" task129-x64 timeout -s TERM -k 60 45m "$T/check-home.sh" > "$T/check-home-h71.log" 2>&1
c=$?; log "check-home at H7.1 exit $c"
[ "$c" = 0 ] || exit $c
CMDS=commands-l4d.txt "$T/print-steps.sh" "$OUT" L4d > "$T/print-l4d.log" 2>&1
c=$?; log "print L4d exit $c"
[ "$c" = 0 ] || exit $c
CMDS=commands-l4d.txt OUT=$OUT "$T/drive.sh" L4d
c=$?; log "L4d driver exit $c"
exit $c
