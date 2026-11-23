#!/bin/bash
# Task 99 (T7 part 2, at H''''; from step.sh): one private step inside its hold of the host lock (drive-h4.sh runs it
# under locked.sh t7-arm64), on the H'''' checkout and the 0.4.1 acceptance home. It waits, inside the hold, up to 6
# minutes for a quiet host (no stress-ng, the 1-minute load below 1.0), records the load it starts at, then runs the
# step as the gate gives it, capped at 45 minutes. STEP_FLAGS adds gate flags (the counter pilot: --dev --pilot 2
# --engine-stats); without them the step is counted. Its own lines start with "step.sh ".
# usage: step-h4.sh <step> <out root>
set -u
D=/Users/new/.local/share/cua-171
T=$D/task99
ACC=$D/m5/home-arm64-041
step=$1; OUT=$2
read -ra flags <<<"${STEP_FLAGS:-}"
[ -e "$D/hold-sittings" ] && { echo "step.sh hold-sittings present inside the hold: $step not started"; exit 5; }
start=$(date +%s)
while [ $(( $(date +%s) - start )) -lt 360 ]; do
  if ! pgrep -x stress-ng > /dev/null && awk -v l="$(cut -d' ' -f1 /proc/loadavg)" 'BEGIN{exit !(l < 1.0)}'; then break; fi
  sleep 10
done
s=none; pgrep -x stress-ng > /dev/null && s=RUNNING
echo "step.sh $(date -u +%FT%TZ) start $step after $(( $(date +%s) - start )) s quiet wait: load=$(cut -d' ' -f1-3 /proc/loadavg) stress-ng=$s flags=[${flags[*]}]"
timeout -s TERM -k 120 45m "$T/g4.sh" run "$step" --pinned "$ACC" --out "$OUT" --holder t7-arm64 ${flags[@]+"${flags[@]}"}
code=$?
echo "step.sh $(date -u +%FT%TZ) end $step exit $code load=$(cut -d' ' -f1-3 /proc/loadavg)"
exit $code
