#!/bin/bash
# Task 105 (from task 99's and task 89's drive.sh): x64's private steps at H'''' on 0.4.1, one after another, as the
# gate gives them (gate.mjs run <step> --pinned <home-x64-041> --out <outroot> --holder t105-x64), each its own hold of
# the host lock (holder t105-x64) through step.sh, which waits inside the hold for a quiet host and caps the step at
# 45 minutes. OUT names the out root (default m5/out-x64-h4); FLAGS, extra gate flags for every step (the counter
# pilot's `--dev --pilot 2 --engine-stats`).
# Before each step: a STOP file in the out root stops the driver; hold-sittings stops it (checked before and again
# inside the hold). A step's failure is recorded and the next step runs, but a refused start (exit 2) stops the driver,
# since every later step would refuse on it too; so does exit 5 (the hold appeared).
# usage: [OUT=<dir>] [FLAGS="..."] drive.sh <step>...   (log: <outroot>/driver.log)
set -u
D=/Users/new/.local/share/cua-171
T=$D/task105
OUT=${OUT:-$D/m5/out-x64-h4}
read -ra flags <<<"${FLAGS:-}"
HOLD=$D/hold-sittings
mkdir -p "$OUT"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$OUT/driver.log"; }
log "driver start: $* flags: ${flags[*]:-none}"
for step in "$@"; do
  if [ -e "$OUT/STOP" ]; then log "STOP file present: stopping before $step"; exit 3; fi
  if [ -e "$HOLD" ]; then log "hold-sittings present: stopping before $step"; exit 5; fi
  log "wait $step load=$(cut -d' ' -f1-3 /proc/loadavg)"
  CUA_LOCK_MAX=56m "$D/locked.sh" t105-x64 "$T/step.sh" "$step" "$OUT" ${flags[@]+"${flags[@]}"} > "$OUT/$step.driver.out" 2>&1
  code=$?
  log "end $step exit $code load=$(cut -d' ' -f1-3 /proc/loadavg) $(grep -v '^step.sh ' "$OUT/$step.driver.out" | tail -1 | cut -c1-200)"
  grep '^step.sh ' "$OUT/$step.driver.out" | sed 's/^/    /' >> "$OUT/driver.log"
  [ "$code" -eq 124 ] && log "TIMEOUT $step: the hold's cap ended it"
  if [ "$code" -eq 2 ]; then log "REFUSED $step (exit 2): driver stopped; read $OUT/$step.driver.out"; exit 2; fi
  if [ "$code" -eq 5 ]; then log "hold-sittings inside the hold before $step: driver stopped"; exit 5; fi
done
log "driver done: $*"
