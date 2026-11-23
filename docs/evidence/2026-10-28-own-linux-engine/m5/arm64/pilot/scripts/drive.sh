#!/bin/bash
# Task 96 (from task 89's drive.sh): the arm64 pilot's private steps one after another, each as the gate prints it in
# the pilot form (gate.mjs run <step> --pinned <the pilot home> --pilot 2 --out <outroot> --holder t96-arm64: a
# development run on the pinned release, never counted), each its own locked hold (holder t96-arm64), each capped at
# 45 minutes (SIGTERM, which gate.mjs forwards to the harness; SIGKILL 2 min later). The run's Node 24.22.1 is first on
# PATH (the controller's word), so every child node is it. Before each step: hold-sittings absent (the driver stops if it
# exists), no stress-ng, and a quiet host (1-minute load below 1.0, waiting up to 15 min, then started anyway with the
# load recorded). A STOP file in the out root stops it before the next step. A step's failure is recorded and the next
# step runs, but a refused start (exit 2) stops the driver, since every later step would refuse on it too.
# PILOT_OUT names another out root (a step's repeat); PILOT_N the pilot's --pilot n (default 2): a larger n repeats a
# step with more samples (L4a's rate: --pilot 100 caps no cell of its plan, so its whole series runs, still a pilot).
# usage: drive.sh <step>...   (log: <outroot>/driver.log)
set -u
D=/Users/new/.local/share/cua-171
T=$D/task96
ACC=$D/m5/pilot-arm64/home
OUT=${PILOT_OUT:-$D/m5/pilot-arm64/out}   # another out root (PILOT_OUT) for a step's repeat
HOLD=$D/hold-sittings
export PATH=$D/node24/bin:$PATH
mkdir -p "$OUT"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$OUT/driver.log"; }
log "driver start: $* (node $(command -v node) $(node --version))"
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
  "$D/locked.sh" t96-arm64 timeout -s TERM -k 120 45m "$T/g.sh" run "$step" --pinned "$ACC" --pilot "${PILOT_N:-2}" --out "$OUT" --holder t96-arm64 > "$OUT/$step.driver.out" 2>&1
  code=$?
  [ "$code" -eq 124 ] && log "TIMEOUT $step: past 45 min, stopped"
  log "end $step exit $code load=$(cut -d' ' -f1-3 /proc/loadavg) $(tail -1 "$OUT/$step.driver.out" | cut -c1-200)"
  if [ "$code" -eq 2 ]; then log "REFUSED $step (exit 2): driver stopped; read $OUT/$step.driver.out"; exit 2; fi
done
log "driver done: $*"
