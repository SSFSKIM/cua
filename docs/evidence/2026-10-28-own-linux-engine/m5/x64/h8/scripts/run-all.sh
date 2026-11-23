#!/bin/bash
# Task 135: x64's counted reach at H8, in order, each part its own hold of the host lock (holder h8-x64), stopping at
# the first failure (nothing is rerun):
#   1. setup (setup.sh), 2. home-x64-043's own install and check --pinned (install-home.sh), 3. item 9 (item9.sh),
#   4. the steps' printed lines (print-steps.sh), 5. the counted steps through drive.sh, in the gate's order: the idle
#   block D1, C1, K1, K2, K3, then H1 (the cross-check, idle), then twice the load L2a, L4b, L4c, L4d,
#   6. the doctor on the pinned home (item9.sh home), after the steps.
# Logs beside this script (run-all.log).
set -u
D=/Users/new/.local/share/cua-171
T=$D/task135
OUT=$D/m5/out-x64-h8
L="$D/locked.sh h8-x64"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$T/run-all.log"; }
pre() { [ -e "$D/hold-sittings" ] && { log "hold-sittings present: stopped"; exit 5; }; local f; f=$(df -BG --output=avail / | tail -1 | tr -dc 0-9); [ "$f" -gt 20 ] || { log "only ${f}G free: stopped"; exit 9; }; }
pre; $L timeout -s TERM -k 60 45m "$T/setup.sh" > "$T/setup.log" 2>&1; c=$?; log "setup exit $c"; [ "$c" = 0 ] || exit 1
pre; $L timeout -s TERM -k 60 45m "$T/install-home.sh" > "$T/install-home.log" 2>&1; c=$?; log "install-home exit $c"; [ "$c" = 0 ] || exit 1
pre; $L timeout -s TERM -k 60 45m "$T/item9.sh" > "$T/item9.outer.log" 2>&1; c=$?; log "item 9 exit $c"; [ "$c" = 0 ] || exit 1
"$T/print-steps.sh" "$OUT" D1 C1 K1 K2 K3 H1 L2a L4b L4c L4d > "$T/print.log" 2>&1; c=$?; log "print exit $c"; [ "$c" = 0 ] || exit 1
OUT=$OUT "$T/drive.sh" D1 C1 K1 K2 K3 H1 L2a L4b L4c L4d; c=$?; log "driver exit $c"; [ "$c" = 0 ] || exit 6
pre; $L timeout -s TERM -k 60 45m "$T/item9.sh" home > "$T/doctor-home.outer.log" 2>&1; c=$?; log "doctor on the pinned home exit $c"
exit $c
