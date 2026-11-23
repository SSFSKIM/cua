#!/bin/bash
# Task 136: V5's rerun whole at H8 after ruling 1046's clearance, with the capture sidecar beside it (rulings 1046,
# 1047). The sidecar (~/.local/share/cua-171/bin/flag-capture.py, outside the repository) starts just before the sitting
# launcher, reads only the new run's flags.jsonl, writes only into m5/capture-arm64-h8/, and is stopped by its stop file
# once the sitting has ended. It is never part of the sitting: run-sitting.sh v5r runs exactly as it would without it.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task136
O=$D/m5/out-arm64-h8
C=$D/m5/capture-arm64-h8
[ -e "$O/V5.pinned-release" ] && [ -e "$O/V5.pinned-release/flags.jsonl" ] && { echo "a V5 run already wrote $O/V5.pinned-release: not started"; exit 2; }
[ -e "$C" ] && { echo "$C exists: not started"; exit 2; }
mkdir -p "$C"
"$T/print-zero.sh" -v5r "$O" V5 >> "$C/v5r.log" 2>&1 || { echo "print V5 failed"; exit 1; }
nice -n 10 python3 -I "$D/bin/flag-capture.py" --flags "$O/V5.pinned-release/flags.jsonl" --out "$C" --until "$C/STOP" > "$C/sidecar.out" 2>&1 &
sc=$!
echo "$(date -u +%FT%TZ) sidecar pid $sc started" >> "$C/v5r.log"
"$T/run-sitting.sh" v5r
code=$?
echo "$(date -u +%FT%TZ) sitting exit $code" >> "$C/v5r.log"
touch "$C/STOP"
for i in $(seq 1 50); do kill -0 "$sc" 2>/dev/null || break; sleep 0.1; done
kill -0 "$sc" 2>/dev/null && echo "$(date -u +%FT%TZ) sidecar still running after its stop file" >> "$C/v5r.log"
wait "$sc" 2>/dev/null; echo "$(date -u +%FT%TZ) sidecar exit $?" >> "$C/v5r.log"
exit $code
