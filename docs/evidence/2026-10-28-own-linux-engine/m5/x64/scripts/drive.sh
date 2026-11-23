#!/bin/bash
# Task 89 (from task 87's drive.sh): T5's counted private steps one after another, as the gate prints them
# (gate.mjs run <step> --pinned <the acceptance home> --out <outroot> --holder t5-x64: the home's installed
# linux-engine-v0.4.0 by the pinned rule, acceptance on the pinned release), each its own locked hold (holder t5-x64),
# each capped at 45 minutes (SIGTERM, which gate.mjs forwards to the harness; SIGKILL 2 min later). Before each step:
# hold-sittings absent (the driver stops if it exists), no stress-ng, and a quiet host (1-minute load below 1.0,
# waiting up to 15 min, then started anyway with the load recorded). A STOP file in the out root stops it before the
# next step. A step's failure is recorded and the next step runs, but a refused start (exit 2: the start check named a
# leftover, or the gate refused) stops the driver, since every later step would refuse on it too.
# usage: drive.sh <step>...   (log: <outroot>/driver.log)
set -u
D=/Users/new/.local/share/cua-171
T=$D/task89
ACC=$D/m5/home-x64
OUT=$D/m5/out-x64
HOLD=$D/hold-sittings
mkdir -p "$OUT"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$OUT/driver.log"; }
log "driver start: $*"
for step in "$@"; do
  if [ -e "$OUT/STOP" ]; then log "STOP file present: stopping before $step"; exit 3; fi
  if [ -e "$HOLD" ]; then log "hold-sittings present: stopping before $step"; exit 5; fi
  while pgrep -x stress-ng > /dev/null; do log "stress-ng running: waiting before $step"; sleep 30; done
  for i in $(seq 1 90); do
    l=$(cut -d' ' -f1 /proc/loadavg)
    awk -v l="$l" 'BEGIN{exit !(l < 1.0)}' && break
    sleep 10
  done
  if [ -e "$HOLD" ]; then log "hold-sittings appeared: stopping before $step"; exit 5; fi
  log "start $step load=$(cut -d' ' -f1-3 /proc/loadavg)"
  "$D/locked.sh" t5-x64 timeout -s TERM -k 120 45m "$T/g.sh" run "$step" --pinned "$ACC" --out "$OUT" --holder t5-x64 > "$OUT/$step.driver.out" 2>&1
  code=$?
  [ "$code" -eq 124 ] && log "TIMEOUT $step: past 45 min, stopped"
  log "end $step exit $code load=$(cut -d' ' -f1-3 /proc/loadavg) $(tail -1 "$OUT/$step.driver.out" | cut -c1-200)"
  if [ "$code" -eq 2 ]; then log "REFUSED $step (exit 2): driver stopped; read $OUT/$step.driver.out"; exit 2; fi
done
log "driver done: $*"
