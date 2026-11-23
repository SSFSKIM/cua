#!/bin/bash
# Task 87 (from task 79's drive.sh): M5's x64 pilot, the gate's private steps one after another in their smallest form
# (gate.mjs run <step> --pinned <run home> --dev --pilot 2: the run home's installed linux-engine-v0.4.0, a development
# run, never counted), each its own locked step (holder t87-pilot), each capped at 45 minutes (SIGTERM, which gate.mjs
# forwards to the harness; SIGKILL 2 min later). Before each step: no hold-sittings (wait while it exists), no
# stress-ng, and a quiet host (1-minute load below 1.0, waiting up to 15 min, then started anyway with the load
# recorded). A step's failure is recorded and the next step runs.
# usage: drive.sh <out> <step>...   (log: <out>/driver.log)
set -u
OUT=$1; shift
D=/Users/new/.local/share/cua-171
T=$D/task87/x64
ACC=$D/m5/pilot-x64/home
HOLD=$D/hold-sittings
mkdir -p "$OUT"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$OUT/driver.log"; }
for step in "$@"; do
  if [ -e "$OUT/STOP" ]; then log "STOP file present: stopping before $step"; exit 3; fi
  while [ -e "$HOLD" ]; do log "hold-sittings present: waiting before $step"; sleep 60; done
  while pgrep -x stress-ng > /dev/null; do log "stress-ng running: waiting before $step"; sleep 30; done
  for i in $(seq 1 90); do
    l=$(cut -d' ' -f1 /proc/loadavg)
    awk -v l="$l" 'BEGIN{exit !(l < 1.0)}' && break
    sleep 10
  done
  [ -e "$HOLD" ] && { log "hold-sittings appeared: waiting before $step"; while [ -e "$HOLD" ]; do sleep 60; done; }
  log "start $step load=$(cut -d' ' -f1-3 /proc/loadavg)"
  "$D/locked.sh" t87-pilot timeout -s TERM -k 120 45m "$T/g.sh" run "$step" --pinned "$ACC" --out "$OUT" --dev --pilot 2 --holder t87-pilot > "$OUT/$step.driver.out" 2>&1
  code=$?
  [ "$code" -eq 124 ] && log "TIMEOUT $step: past 45 min, stopped"
  log "end $step exit $code load=$(cut -d' ' -f1-3 /proc/loadavg) $(tail -1 "$OUT/$step.driver.out" | cut -c1-200)"
done
log "driver done: $*"
