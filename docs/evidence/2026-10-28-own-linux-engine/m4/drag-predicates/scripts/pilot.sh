#!/bin/bash
# Task 70's pilot (exploration, not counts): what Gecko takes on the background route under each occlusion of the
# kinds and drag experiments, on a private display. The pinned build sends background moves and drags whatever the
# cover (it has no device mode), and the control lane (`xtest`) shows the reader works; the candidate is the engine of
# T13's head, whose Gecko rule refuses every request under any cover. Each occlusion is its own run on its own display.
# usage: pilot.sh <harness dir> <candidate engine path> <name prefix> [occlusions...]
set -u
d=$(dirname "$0")
. "$d/env.sh"
h=$1
cand=$2
prefix=$3
shift 3
occlusions=${*:-covered partial partial-deep partial-top}
status=0
"$cand" --version
for occ in $occlusions; do
  echo "start $prefix-kinds-$occ $(date -u +%FT%TZ) loadavg $(cut -d' ' -f1-3 /proc/loadavg)"
  "$d/private.sh" "$h" "$prefix-kinds-$occ" --experiment kinds --vendor "$PINNED" --cua "$cand" --family firefox --ops move,scroll,click \
    --occlusion "$occ" --lanes pinned,cua,xtest --trials 10 --run "t70-$prefix-kinds-$occ" || status=1
  echo "start $prefix-drag-$occ $(date -u +%FT%TZ) loadavg $(cut -d' ' -f1-3 /proc/loadavg)"
  "$d/private.sh" "$h" "$prefix-drag-$occ" --experiment drag --vendor "$PINNED" --cua "$cand" --family firefox \
    --occlusion "$occ" --lanes pinned,cua,xtest --trials 10 --run "t70-$prefix-drag-$occ" || status=1
done
echo "end $(date -u +%FT%TZ) loadavg $(cut -d' ' -f1-3 /proc/loadavg)"
exit $status
