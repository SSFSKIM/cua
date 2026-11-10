#!/bin/bash
# Task 71's proof of the build (T19's row), idle, one step per call so each holds the host lock about 45 minutes at
# most (the coordinator's request), each on its own private display (private.sh), never :0. A dev run, not a release
# gate. Steps:
#   manifest-a  the adopted cases' manifest (`--experiment predicates`, T19's), its click and scroll cases
#   manifest-b  its move and selection cases
#   leave-a     its click and scroll leave cases alone (`--plan leave`)
#   device      the device-mode cases of Firefox and Chrome, with their witness and audit (cua alone)
#   controls    the sitting's Chrome and Electron cells again on the build, to compare with the sitting's
# usage: build-proof.sh <harness dir> <candidate engine path> <name> <step>   (exits with the run's status)
set -u
d=$(dirname "$0")
. "$d/env.sh"
h=$1
cand=$2
name=$3
step=$4
for _ in $(seq 60); do
  awk '{exit !($1 <= 1.0)}' /proc/loadavg && break
  sleep 5
done
"$cand" --version
sha256sum "$cand"
echo "start $name-$step $(date -u +%FT%TZ) loadavg $(cut -d' ' -f1-3 /proc/loadavg)"
case "$step" in
  manifest-a) "$d/private.sh" "$h" "$name-$step" --experiment predicates --ops click,scroll --vendor "$PINNED" --cua "$cand" --run "t71-$name-$step" ;;
  manifest-b) "$d/private.sh" "$h" "$name-$step" --experiment predicates --ops move,select --vendor "$PINNED" --cua "$cand" --run "t71-$name-$step" ;;
  leave-a) "$d/private.sh" "$h" "$name-$step" --experiment predicates --plan leave --ops click,scroll --vendor "$PINNED" --cua "$cand" --run "t71-$name-$step" ;;
  device) "$d/private.sh" "$h" "$name-$step" --dev --vendor "$PINNED" --newest "$NEWEST" --cua "$cand" \
    --scene device-firefox,device-chrome --ops all --blocks 3 --run "t71-$name-$step" ;;
  controls) "$d/private.sh" "$h" "$name-$step" --experiment pointer-route --family chrome,electron --vendor "$PINNED" --cua "$cand" --run "t71-$name-$step" ;;
  *) echo "manifest-a, manifest-b, leave-a, device or controls" >&2; exit 2 ;;
esac
status=$?
echo "end $name-$step $(date -u +%FT%TZ) loadavg $(cut -d' ' -f1-3 /proc/loadavg) status $status"
exit $status
