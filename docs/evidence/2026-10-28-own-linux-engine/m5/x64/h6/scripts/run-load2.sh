#!/bin/bash
# Task 123: the counted block at twice the load at H6 (the gate gives each step its load), through drive.sh, fenced by
# FENCE when given (before V5's sitting: 02:15Z). The steps not yet run are given as arguments.
# usage: [FENCE=<epoch>] run-load2.sh <step>...
set -u
D=/Users/new/.local/share/cua-171
T=$D/task123
echo "$(date -u +%FT%TZ) load2 start: $* fence ${FENCE:-none}" >> "$T/run-load2.log"
OUT=$D/m5/out-x64-h6 "$T/drive.sh" "$@"
c=$?
echo "$(date -u +%FT%TZ) load2 driver exit $c" >> "$T/run-load2.log"
exit $c
