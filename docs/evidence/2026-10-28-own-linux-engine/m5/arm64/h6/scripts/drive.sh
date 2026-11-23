#!/bin/bash
# Task 122 (from task 99's drive-h4.sh): private steps one after another, each its own hold of the host lock (holder
# task122-arm64) through step.sh, on the H6 checkout and the 0.4.2 acceptance home. OUT_ROOT names the out root
# (default m5/out-arm64-h6). A STOP file in the out root stops it before the next step; hold-sittings stops it; a
# refused start (exit 2) stops it; 20G or less free on / stops it (ruling 937); and, unlike task 99's, any step that
# exits nonzero stops it (the brief: a failure comes to the controller at once, never run around).
# usage: drive.sh <step>...   (log: <outroot>/driver.log)
set -u
D=/Users/new/.local/share/cua-171
T=$D/task122
OUT=${OUT_ROOT:-$D/m5/out-arm64-h6}
HOLD=$D/hold-sittings
mkdir -p "$OUT"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$OUT/driver.log"; }
free_g() { df -BG --output=avail / | tail -1 | tr -dc 0-9; }
log "driver start: $* (df / avail $(free_g)G)"
for step in "$@"; do
  if [ -e "$OUT/STOP" ]; then log "STOP file present: stopping before $step"; exit 3; fi
  if [ -e "$HOLD" ]; then log "hold-sittings present: stopping before $step"; exit 5; fi
  f=$(free_g)
  if [ "$f" -le 20 ]; then log "disk: ${f}G free on /, 20G or less (ruling 937): stopping before $step"; exit 9; fi
  log "wait $step load=$(cut -d' ' -f1-3 /proc/loadavg) df / avail ${f}G"
  CUA_LOCK_MAX=56m "$D/locked.sh" task122-arm64 "$T/step.sh" "$step" "$OUT" > "$OUT/$step.driver.out" 2>&1
  code=$?
  log "end $step exit $code load=$(cut -d' ' -f1-3 /proc/loadavg) $(grep -v '^step.sh ' "$OUT/$step.driver.out" | tail -1 | cut -c1-200)"
  grep '^step.sh ' "$OUT/$step.driver.out" | sed 's/^/    /' >> "$OUT/driver.log"
  [ "$code" -eq 124 ] && log "TIMEOUT $step: the hold's cap ended it"
  if [ "$code" -eq 2 ]; then log "REFUSED $step (exit 2): driver stopped; read $OUT/$step.driver.out"; exit 2; fi
  if [ "$code" -eq 5 ]; then log "hold-sittings inside the hold before $step: driver stopped"; exit 5; fi
  if [ "$code" -ne 0 ]; then log "FAILED $step (exit $code): driver stopped for the controller"; exit 1; fi
done
log "driver done: $*"
