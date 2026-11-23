#!/bin/bash
# Task 105: setup, each part its own hold of the host lock (holder t105-x64): the checkout's install, then the
# acceptance home's own install. Logs beside this script.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task105
L="$D/locked.sh t105-x64"
[ -e "$D/hold-sittings" ] && { echo "hold-sittings present"; exit 5; }
$L timeout -s TERM -k 120 45m "$T/setup.sh" > "$T/setup-t105.log" 2>&1; c=$?; echo "$(date -u +%FT%TZ) setup t105-x64 exit $c" | tee -a "$T/setup-all.log"
[ "$c" = 0 ] || exit $c
[ -e "$D/hold-sittings" ] && { echo "hold-sittings present"; exit 5; }
$L timeout -s TERM -k 120 30m "$T/install-home.sh" > "$T/install-home.log" 2>&1; c=$?; echo "$(date -u +%FT%TZ) install-home exit $c" | tee -a "$T/setup-all.log"
echo "$(date -u +%FT%TZ) setup-all done" | tee -a "$T/setup-all.log"
