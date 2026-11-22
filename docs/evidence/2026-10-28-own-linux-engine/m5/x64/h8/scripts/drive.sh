#!/bin/bash
# Task 135 (task 129's drive.sh, task 123's list form): x64's counted steps at H8, one after another in the order given,
# each its own hold of the host lock as the brief gives it:
#   locked.sh h8-x64 timeout -s TERM -k 60 45m step.sh <step>
# (step.sh waits inside the hold for a quiet host, then execs the step's printed line; the lock is released when it
# ends). Before each step: `df -h /` more than 20G free (ruling 937), else stopped (exit 9); hold-sittings absent (exit
# 5); a STOP file in the out root stops the driver (exit 3). A step's nonzero exit stops the driver (exit 6), so a
# failure reaches the controller at once and nothing runs past it; nothing is rerun.
# usage: OUT=<out root> drive.sh <step>...   (log: <out root>/driver.log)
set -u
D=/Users/new/.local/share/cua-171
T=$D/task135
OUT=${OUT:?}
mkdir -p "$OUT"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$OUT/driver.log"; }
log "driver start: $*"
for step in "$@"; do
  free=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
  if [ -e "$OUT/STOP" ]; then log "STOP file present: stopping before $step"; exit 3; fi
  if [ -e "$D/hold-sittings" ]; then log "hold-sittings present: stopping before $step"; exit 5; fi
  if [ "$free" -le 20 ]; then log "only ${free}G free on / (ruling 937: more than 20G): stopping before $step"; exit 9; fi
  log "wait $step load=$(cut -d' ' -f1-3 /proc/loadavg) df avail ${free}G"
  "$D/locked.sh" h8-x64 timeout -s TERM -k 60 45m "$T/step.sh" "$step" > "$OUT/$step.driver.out" 2>&1
  code=$?
  log "end $step exit $code load=$(cut -d' ' -f1-3 /proc/loadavg) $(grep -v '^step.sh ' "$OUT/$step.driver.out" | tail -1 | cut -c1-200)"
  grep '^step.sh ' "$OUT/$step.driver.out" | sed 's/^/    /' >> "$OUT/driver.log"
  [ "$code" -eq 124 ] && log "TIMEOUT $step: the 45-minute cap ended it"
  if [ "$code" -ne 0 ]; then log "FAILED $step (exit $code): driver stopped; read $OUT/$step.driver.out"; exit 6; fi
done
log "driver done: $*"
