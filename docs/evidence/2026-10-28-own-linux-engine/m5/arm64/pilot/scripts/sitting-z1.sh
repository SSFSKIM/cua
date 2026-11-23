#!/bin/bash
# Task 96: the V5 and Z0 rerun sitting under the short out root m5/pa/z1 (suffix -z1), with ss-watch.sh observing
# autobind-shaped abstract sockets beside it, read only, stopped when the sitting ends.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task96
OUTR=$D/m5/pa/z1
mkdir -p "$OUTR"
rm -f "$T/ss-watch-z1.stop"
"$T/ss-watch.sh" "$T/ss-watch-z1.log" "$T/ss-watch-z1.stop" &
hs=$(( $(date +%s) + 80*60 ))
"$T/sitting-locked.sh" 90m "$hs" -z1 "$OUTR" development-run.pinned.pilot V5:38 Z0:25
code=$?
touch "$T/ss-watch-z1.stop"; wait
echo "sitting-z1 exit $code $(date -u +%FT%TZ)"
