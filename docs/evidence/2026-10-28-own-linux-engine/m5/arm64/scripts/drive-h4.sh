#!/bin/bash
# Task 99 (T7 part 2, at H''''; from drive.sh): private steps one after another, each its own hold of the host lock
# (holder t7-arm64) through step-h4.sh, on the H'''' checkout and the 0.4.1 acceptance home. T7_OUT names the out root
# (default m5/out-arm64-h4); STEP_FLAGS passes gate flags to every step (the counter pilot). A STOP file in the out
# root stops it before the next step; hold-sittings stops it; a refused start (exit 2) stops it.
# usage: drive-h4.sh <step>...   (log: <outroot>/driver.log)
set -u
D=/Users/new/.local/share/cua-171
T=$D/task99
OUT=${T7_OUT:-$D/m5/out-arm64-h4}
HOLD=$D/hold-sittings
export STEP_FLAGS=${STEP_FLAGS:-}
mkdir -p "$OUT"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$OUT/driver.log"; }
log "driver start: $* (flags [$STEP_FLAGS])"
for step in "$@"; do
  if [ -e "$OUT/STOP" ]; then log "STOP file present: stopping before $step"; exit 3; fi
  if [ -e "$HOLD" ]; then log "hold-sittings present: stopping before $step"; exit 5; fi
  log "wait $step load=$(cut -d' ' -f1-3 /proc/loadavg)"
  CUA_LOCK_MAX=56m "$D/locked.sh" t7-arm64 "$T/step-h4.sh" "$step" "$OUT" > "$OUT/$step.driver.out" 2>&1
  code=$?
  log "end $step exit $code load=$(cut -d' ' -f1-3 /proc/loadavg) $(grep -v '^step.sh ' "$OUT/$step.driver.out" | tail -1 | cut -c1-200)"
  grep '^step.sh ' "$OUT/$step.driver.out" | sed 's/^/    /' >> "$OUT/driver.log"
  [ "$code" -eq 124 ] && log "TIMEOUT $step: the hold's cap ended it"
  if [ "$code" -eq 2 ]; then log "REFUSED $step (exit 2): driver stopped; read $OUT/$step.driver.out"; exit 2; fi
  if [ "$code" -eq 5 ]; then log "hold-sittings inside the hold before $step: driver stopped"; exit 5; fi
done
log "driver done: $*"
