#!/bin/bash
# Task 129: setup, each part its own hold of the host lock (holder task129-x64): the t129-x64 checkout's install, then
# home-x64-042's check at H7. Logs beside this script.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task129
L="$D/locked.sh task129-x64"
[ -e "$D/hold-sittings" ] && { echo "hold-sittings present"; exit 5; }
$L timeout -s TERM -k 60 45m "$T/setup.sh" > "$T/setup-t129.log" 2>&1; c=$?; echo "$(date -u +%FT%TZ) setup t129-x64 exit $c" | tee -a "$T/setup-all.log"
[ "$c" = 0 ] || exit $c
$L timeout -s TERM -k 60 45m "$T/check-home.sh" > "$T/check-home.log" 2>&1; c=$?; echo "$(date -u +%FT%TZ) check-home exit $c" | tee -a "$T/setup-all.log"
exit $c
