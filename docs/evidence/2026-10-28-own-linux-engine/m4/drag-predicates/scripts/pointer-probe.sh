#!/bin/bash
# Task 70's pointer probe (measured, never judged): what Gecko takes from cua's own background moves and drags, the
# cover left unjudged, with the real pointer parked in the window or outside it (predicates.mjs `POINTER_PROBE`), on a
# private display.
# usage: pointer-probe.sh <harness dir> <candidate engine path> <name>
set -u
d=$(dirname "$0")
. "$d/env.sh"
for _ in $(seq 60); do
  awk '{exit !($1 <= 1.0)}' /proc/loadavg && break
  sleep 5
done
"$2" --version
echo "start $3 $(date -u +%FT%TZ) loadavg $(cut -d' ' -f1-3 /proc/loadavg)"
"$d/private.sh" "$1" "$3" --experiment predicates --plan "${PLAN:-pointer}" --vendor "$PINNED" --cua "$2" --run "t70-$3"
status=$?
echo "end $3 $(date -u +%FT%TZ) loadavg $(cut -d' ' -f1-3 /proc/loadavg) status $status"
exit $status
