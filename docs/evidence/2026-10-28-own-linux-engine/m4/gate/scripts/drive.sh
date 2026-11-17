#!/bin/bash
# Task 76: M4's private gate steps, one after another, each its own locked step (gate.mjs run under locked.sh). Before
# each step: no hold-sittings (wait while it exists), no stress-ng, and a quiet host (1-minute load below 1.0, waiting
# up to 15 min, then started anyway with the load recorded). A step's failure is recorded and the next step runs.
# usage: drive.sh <candidate> <out> <step>...   (log: <out>/driver.log)
set -u
CAND=$1; OUT=$2; shift 2
GATE=/Users/new/Developer/GitHub/cua/.claude/worktrees/t76-gate
D=/Users/new/.local/share/cua-171
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
  "$D/locked.sh" t18-gate node "$GATE/scripts/linux-engine-gate/gate.mjs" run "$step" --candidate "$CAND" --out "$OUT" > "$OUT/$step.driver.out" 2>&1
  code=$?
  log "end $step exit $code load=$(cut -d' ' -f1-3 /proc/loadavg) $(tail -1 "$OUT/$step.driver.out" | cut -c1-200)"
done
log "driver done: $*"
