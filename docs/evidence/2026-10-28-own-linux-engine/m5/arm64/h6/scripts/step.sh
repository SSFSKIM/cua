#!/bin/bash
# Task 122 (from task 99's step-h4.sh): one private step inside its hold of the host lock (drive.sh runs it under
# locked.sh task122-arm64), on the H6 checkout and the 0.4.2 acceptance home, counted. It waits, inside the hold, up to
# 6 minutes for a quiet host (no stress-ng, the 1-minute load below 1.0), records the load it starts at, then runs the
# step as the gate gives it, capped at 45 minutes. Its own lines start with "step.sh ".
# usage: step.sh <step> <out root>
set -u
D=/Users/new/.local/share/cua-171
T=$D/task122
ACC=$D/m5/home-arm64-042
step=$1; OUT=$2
[ -e "$D/hold-sittings" ] && { echo "step.sh hold-sittings present inside the hold: $step not started"; exit 5; }
start=$(date +%s)
while [ $(( $(date +%s) - start )) -lt 360 ]; do
  if ! pgrep -x stress-ng > /dev/null && awk -v l="$(cut -d' ' -f1 /proc/loadavg)" 'BEGIN{exit !(l < 1.0)}'; then break; fi
  sleep 10
done
s=none; pgrep -x stress-ng > /dev/null && s=RUNNING
echo "step.sh $(date -u +%FT%TZ) start $step after $(( $(date +%s) - start )) s quiet wait: load=$(cut -d' ' -f1-3 /proc/loadavg) stress-ng=$s"
timeout -s TERM -k 120 45m "$T/g6.sh" run "$step" --pinned "$ACC" --out "$OUT" --holder task122-arm64
code=$?
echo "step.sh $(date -u +%FT%TZ) end $step exit $code load=$(cut -d' ' -f1-3 /proc/loadavg)"
exit $code
