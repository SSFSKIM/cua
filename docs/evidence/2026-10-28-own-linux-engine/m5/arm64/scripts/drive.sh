#!/bin/bash
# Task 99 (T7; from task 89's and task 96's drive.sh): the arm64 counted private steps one after another, as the gate
# prints them (gate.mjs run <step> --pinned <the acceptance home> --out <outroot> --holder t7-arm64: the home's installed
# linux-engine-v0.4.0 by the pinned rule, acceptance on the pinned release), each its own hold of the host lock (holder
# t7-arm64) through step.sh, which waits inside the hold for a quiet host and caps the step at 45 minutes.
# Why the quiet wait is inside the hold, where T5's driver waited before it: another task (m5-l4a) runs experiments at
# twice the load under the same lock on this VM, so a quiet host read before the wait for the lock says nothing about the
# host when the lock is taken.
# Before each step: a STOP file in the out root stops the driver; hold-sittings stops it (checked before and again inside
# the hold). A step's failure is recorded and the next step runs, but a refused start (exit 2: the start check named a
# leftover, or the gate refused) stops the driver, since every later step would refuse on it too; so does exit 5 (the
# hold appeared).
# usage: drive.sh <step>...   (log: <outroot>/driver.log)
set -u
D=/Users/new/.local/share/cua-171
T=$D/task99
OUT=${T7_OUT:-$D/m5/out-arm64}
HOLD=$D/hold-sittings
mkdir -p "$OUT"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$OUT/driver.log"; }
log "driver start: $*"
for step in "$@"; do
  if [ -e "$OUT/STOP" ]; then log "STOP file present: stopping before $step"; exit 3; fi
  if [ -e "$HOLD" ]; then log "hold-sittings present: stopping before $step"; exit 5; fi
  log "wait $step load=$(cut -d' ' -f1-3 /proc/loadavg)"
  CUA_LOCK_MAX=56m "$D/locked.sh" t7-arm64 "$T/step.sh" "$step" "$OUT" > "$OUT/$step.driver.out" 2>&1
  code=$?
  log "end $step exit $code load=$(cut -d' ' -f1-3 /proc/loadavg) $(grep -v '^step.sh ' "$OUT/$step.driver.out" | tail -1 | cut -c1-200)"
  grep '^step.sh ' "$OUT/$step.driver.out" | sed 's/^/    /' >> "$OUT/driver.log"
  [ "$code" -eq 124 ] && log "TIMEOUT $step: the hold's cap ended it"
  if [ "$code" -eq 2 ]; then log "REFUSED $step (exit 2): driver stopped; read $OUT/$step.driver.out"; exit 2; fi
  if [ "$code" -eq 5 ]; then log "hold-sittings inside the hold before $step: driver stopped"; exit 5; fi
done
log "driver done: $*"
