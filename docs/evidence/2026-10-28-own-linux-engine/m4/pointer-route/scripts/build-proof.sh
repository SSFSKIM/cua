#!/bin/bash
# Task 71's proof of the build (T19's row), idle, each run on its own private display (private.sh), never :0: the
# adopted cases' manifest (`--experiment predicates`, T19's), the device-mode cases of Firefox and Chrome with their
# witness and audit (`--scene device-firefox,device-chrome`, cua alone), and the controls' sitting cells again on the
# build (`--experiment pointer-route --family chrome,electron`), so Chromium's cells can be compared with the sitting's.
# A dev run, not a release gate. Run it under the host lock. Exits nonzero when any run fails.
# usage: build-proof.sh <harness dir> <candidate engine path> <name>
set -u
d=$(dirname "$0")
. "$d/env.sh"
h=$1
cand=$2
name=$3
status=0
for _ in $(seq 60); do
  awk '{exit !($1 <= 1.0)}' /proc/loadavg && break
  sleep 5
done
"$cand" --version
sha256sum "$cand"
echo "start $name-predicates $(date -u +%FT%TZ) loadavg $(cut -d' ' -f1-3 /proc/loadavg)"
"$d/private.sh" "$h" "$name-predicates" --experiment predicates --vendor "$PINNED" --cua "$cand" --run "t71-$name-predicates" || status=1
echo "start $name-device $(date -u +%FT%TZ) loadavg $(cut -d' ' -f1-3 /proc/loadavg)"
"$d/private.sh" "$h" "$name-device" --dev --vendor "$PINNED" --newest "$NEWEST" --cua "$cand" \
  --scene device-firefox,device-chrome --ops all --blocks 3 --run "t71-$name-device" || status=1
echo "start $name-controls $(date -u +%FT%TZ) loadavg $(cut -d' ' -f1-3 /proc/loadavg)"
"$d/private.sh" "$h" "$name-controls" --experiment pointer-route --family chrome,electron --vendor "$PINNED" --cua "$cand" --run "t71-$name-controls" || status=1
echo "end $name $(date -u +%FT%TZ) loadavg $(cut -d' ' -f1-3 /proc/loadavg) status $status"
exit $status
