#!/bin/bash
# Task 129 (from task 123's drive.sh): x64's counted C1 and L4c at H7, one step per call, each its own hold of the host
# lock as the binding rule gives it:
#   locked.sh task129-x64 timeout -s TERM -k 60 45m step.sh <step>
# (step.sh waits inside the hold for a quiet host, then execs the step's printed line). Before the step: `df -h /` more
# than 20G free (ruling 937), else not started (exit 9); hold-sittings absent (exit 5). The step's exit is the driver's,
# so a failure reaches the controller at once and nothing runs past it. Log: <out root>/driver.log.
# usage: OUT=<out root> drive.sh <step>
set -u
D=/Users/new/.local/share/cua-171
T=$D/task129
OUT=${OUT:?}
step=$1
mkdir -p "$OUT"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$OUT/driver.log"; }
free=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
log "driver: $step, df avail ${free}G"
if [ "$free" -le 20 ]; then log "only ${free}G free on / (ruling 937: more than 20G): $step not started"; exit 9; fi
if [ -e "$D/hold-sittings" ]; then log "hold-sittings present: $step not started"; exit 5; fi
log "wait $step load=$(cut -d' ' -f1-3 /proc/loadavg)"
"$D/locked.sh" task129-x64 timeout -s TERM -k 60 45m "$T/step.sh" "$step" > "$OUT/$step.driver.out" 2>&1
code=$?
log "end $step exit $code load=$(cut -d' ' -f1-3 /proc/loadavg) $(grep -v '^step.sh ' "$OUT/$step.driver.out" | tail -1 | cut -c1-200)"
grep '^step.sh ' "$OUT/$step.driver.out" | sed 's/^/    /' >> "$OUT/driver.log"
[ "$code" -eq 124 ] && log "TIMEOUT $step: the 45-minute cap ended it"
exit $code
