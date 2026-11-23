#!/bin/bash
# Task 109: V5's rerun (counted), then F2's :0 parts, then F3 (development runs), each its own sitting hold
# (run-sitting.sh). The next one starts only when the one before ended "sitting done", exit 0, with no hold-sittings;
# any other end (a NOT CLEAR, a route-D stop, any V5 failure) stops the chain for the controller.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task109
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$T/chain.log"; }
for mode in v5 f2 f3; do
  [ -e "$D/hold-sittings" ] && { log "hold-sittings present: $mode not started; chain stopped"; exit 5; }
  log "start $mode"
  "$T/run-sitting.sh" "$mode" > "$T/run-sitting-$mode.out" 2>&1
  code=$?
  log "end $mode exit $code"
  [ "$code" = 0 ] && [ ! -e "$D/hold-sittings" ] || { log "chain stopped after $mode"; exit 3; }
done
log "chain done"
