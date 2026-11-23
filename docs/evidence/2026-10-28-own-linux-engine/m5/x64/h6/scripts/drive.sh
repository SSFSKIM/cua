#!/bin/bash
# Task 123 (from task 105's drive.sh): x64's private steps at H6 on 0.4.2, one after another, as the gate gives them
# (gate.mjs run <step> --pinned <home-x64-042> --out <outroot> --holder task123-x64), each its own hold of the host
# lock (holder task123-x64) through step.sh, which waits inside the hold for a quiet host and caps the step at
# 45 minutes. OUT names the out root (default m5/out-x64-h6).
# Before the set (ruling 937): `df -h /` must show more than 20G free, else the driver does not start (exit 9).
# Before each step:
#   - a STOP file in the out root stops the driver; hold-sittings stops it (checked before and again inside the hold);
#   - FENCE (epoch seconds, optional): a step whose gate estimate (minutes, EST_<step>) does not end before it is not
#     started, and the driver stops (exit 4), so the host is free for the :0 sitting.
# A step's nonzero exit stops the driver (exit 6), so a failure reaches the controller at once and no later step runs
# past it; a refused start (exit 2) and hold-sittings inside the hold (exit 5) stop it with their own codes.
# usage: [OUT=<dir>] [FENCE=<epoch>] drive.sh <step>...   (log: <outroot>/driver.log)
set -u
D=/Users/new/.local/share/cua-171
T=$D/task123
OUT=${OUT:-$D/m5/out-x64-h6}
HOLD=$D/hold-sittings
declare -A EST=([D1]=35 [D2]=30 [S1]=39 [H1]=22 [H2]=25 [C1]=4 [K1]=15 [K2]=15 [K3]=6 [S2]=25
  [L1]=22 [L2a]=25 [L2b]=22 [L3a]=26 [L3b]=24 [L4a]=25 [L4b]=25 [L4c]=4)
mkdir -p "$OUT"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$OUT/driver.log"; }
free=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
log "driver start: $* fence: ${FENCE:+$(date -u -d @"$FENCE" +%FT%TZ)} df avail ${free}G"
if [ "$free" -le 20 ]; then log "only ${free}G free on / (ruling 937: more than 20G): not started"; exit 9; fi
for step in "$@"; do
  if [ -e "$OUT/STOP" ]; then log "STOP file present: stopping before $step"; exit 3; fi
  if [ -e "$HOLD" ]; then log "hold-sittings present: stopping before $step"; exit 5; fi
  if [ -n "${FENCE:-}" ]; then
    est=${EST[$step]:-45}
    if [ $(( $(date +%s) + est * 60 + 360 )) -gt "$FENCE" ]; then log "FENCE: $step's ${est} min (and the quiet wait) do not end before $(date -u -d @"$FENCE" +%FT%TZ): stopping before it"; exit 4; fi
  fi
  log "wait $step load=$(cut -d' ' -f1-3 /proc/loadavg) df avail $(df -BG --output=avail / | tail -1 | tr -d ' ')"
  CUA_LOCK_MAX=56m "$D/locked.sh" task123-x64 "$T/step.sh" "$step" "$OUT" > "$OUT/$step.driver.out" 2>&1
  code=$?
  log "end $step exit $code load=$(cut -d' ' -f1-3 /proc/loadavg) $(grep -v '^step.sh ' "$OUT/$step.driver.out" | tail -1 | cut -c1-200)"
  grep '^step.sh ' "$OUT/$step.driver.out" | sed 's/^/    /' >> "$OUT/driver.log"
  [ "$code" -eq 124 ] && log "TIMEOUT $step: the hold's cap ended it"
  if [ "$code" -eq 2 ]; then log "REFUSED $step (exit 2): driver stopped; read $OUT/$step.driver.out"; exit 2; fi
  if [ "$code" -eq 5 ]; then log "hold-sittings inside the hold before $step: driver stopped"; exit 5; fi
  # any other failure stops the set, so it reaches the controller at once and nothing runs on past it (task 123's brief)
  if [ "$code" -ne 0 ]; then log "FAILED $step (exit $code): driver stopped; read $OUT/$step.driver.out"; exit 6; fi
done
log "driver done: $*"
