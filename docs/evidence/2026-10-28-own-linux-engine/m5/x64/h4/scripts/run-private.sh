#!/bin/bash
# Task 105: the private parts after D1, one driver after another: the rest of the counted idle block at H'''' (D2, E1,
# S1, H1, H2; class A and E1), the counter pilot of the class-B idle steps (ruling 828(c): one uncounted run each in
# pilot form, `--dev --pilot 2 --engine-stats`, at idle, its counted load; out root m5/pilot-x64-h4), then the counted
# block at twice the load (L1, L2b, L3b, L4a; the gate gives each its load). A driver's exit 2 or 5 (a refused start,
# or hold-sittings) stops everything after it.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task105
log() { echo "$(date -u +%FT%TZ) $*" >> "$T/run-private.log"; }
phase() {  # <name> <env...> -- <steps...>
  local name=$1; shift
  log "phase $name start: $*"
  env "$@"
  local code=$?
  log "phase $name end exit $code"
  [ "$code" -eq 2 ] || [ "$code" -eq 5 ] || [ "$code" -eq 3 ] && { log "stopped after $name"; exit "$code"; }
  return 0
}
phase idle OUT=$D/m5/out-x64-h4 "$T/drive.sh" D2 E1 S1 H1 H2
phase pilot OUT=$D/m5/pilot-x64-h4 "FLAGS=--dev --pilot 2 --engine-stats" "$T/drive.sh" D1 D3 D4 D5 E1 P4 P6 P5 C1
phase load2 OUT=$D/m5/out-x64-h4 "$T/drive.sh" L1 L2b L3b L4a
log "run-private done"
