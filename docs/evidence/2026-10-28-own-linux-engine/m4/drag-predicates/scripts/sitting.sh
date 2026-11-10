#!/bin/bash
# Task 70's counted sitting, idle, each run on its own private display (private.sh), never :0: the adopted cases'
# manifest (`--experiment predicates`, predicates.mjs), then Acceptance 8's device-mode cases with their witness and
# audit (`--scene device-*`, cua alone, a dev run, not a release gate). Exits nonzero when either run fails.
# usage: sitting.sh <harness dir> <candidate engine path> <name>
set -u
d=$(dirname "$0")
. "$d/env.sh"
h=$1
cand=$2
name=$3
status=0
# an idle sitting starts once the machine is quiet: the 1-minute load at most 1.0, waited for up to 5 minutes
for _ in $(seq 60); do
  awk '{exit !($1 <= 1.0)}' /proc/loadavg && break
  sleep 5
done
"$cand" --version
sha256sum "$cand"
echo "start $name-predicates $(date -u +%FT%TZ) loadavg $(cut -d' ' -f1-3 /proc/loadavg)"
"$d/private.sh" "$h" "$name-predicates" --experiment predicates --vendor "$PINNED" --cua "$cand" --run "t70-$name-predicates" || status=1
echo "start $name-device $(date -u +%FT%TZ) loadavg $(cut -d' ' -f1-3 /proc/loadavg)"
"$d/private.sh" "$h" "$name-device" --dev --vendor "$PINNED" --newest "$NEWEST" --cua "$cand" \
  --scene device-gtk4,device-firefox,device-qt,device-chrome,device-chrome-dnd,device-xterm --ops all --blocks 3 --run "t70-$name-device" || status=1
echo "end $name $(date -u +%FT%TZ) loadavg $(cut -d' ' -f1-3 /proc/loadavg) status $status"
exit $status
