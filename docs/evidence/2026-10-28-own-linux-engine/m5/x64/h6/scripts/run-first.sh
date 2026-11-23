#!/bin/bash
# Task 123: the first private phases, one after another, each under the host lock (holder task123-x64): the local
# proof, item 9, then the idle class-A block with its new short steps first (C1, K1, K2, K3, then D1, D2, S1, H1, H2)
# and S2, fenced so that no step can still run at 02:15Z (the :0 sitting's window opens at 02:30Z).
set -u
D=/Users/new/.local/share/cua-171
T=$D/task123
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$T/run-first.log"; }
[ -e "$D/hold-sittings" ] && { log "hold-sittings present"; exit 5; }
"$T/proof.sh" > "$T/proof.out" 2>&1; c=$?; log "proof exit $c"
[ "$c" = 0 ] || exit 1
[ -e "$D/hold-sittings" ] && { log "hold-sittings present"; exit 5; }
"$D/locked.sh" task123-x64 timeout -s TERM -k 60 20m "$T/item9.sh" > "$T/item9.outer.log" 2>&1; c=$?; log "item9 exit $c"
[ "$c" = 0 ] || exit 1
FENCE=$(date -u -d '2026-11-21T02:15:00Z' +%s) OUT=$D/m5/out-x64-h6 "$T/drive.sh" C1 K1 K2 K3 D1 D2 S1 H1 H2 S2
c=$?; log "idle driver exit $c"
exit $c
