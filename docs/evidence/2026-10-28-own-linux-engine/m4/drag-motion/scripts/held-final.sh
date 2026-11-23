#!/bin/bash
# The held-move sittings on a candidate: Firefox's held moves beside Gecko's held pacing before T11 (`cua:before`, the
# control at today's spacing) and the spacing alternative (`cua:h6L`, 6 ms between points with the lead pause), then
# Chromium's beside its own pacing before T11 (`cua:before`). Extra arguments (a load) go to every sitting.
# usage: held-final.sh <name> <candidate> [extra args]
set -u
d=$(dirname "$0")
name=$1
cand=$2
shift 2
h=$HOME/.local/share/cua-171/task66/harness-ae04d620
"$d/drag.sh" "$h" "$name-firefox" "$cand" --family firefox --ops handle-canvas,handle-dnd --occlusion visible \
  --lanes pinned,newest,cua,cua:before,cua:h6L \
  --variant 'before=--drag-step-us 300 --drag-release-dwell-ms 30 --held-lead-pause' \
  --variant 'h6L=--drag-step-us 300 --drag-release-dwell-ms 30 --held-step-ms 6 --held-lead-pause' "$@"
"$d/drag.sh" "$h" "$name-chromium" "$cand" --family chrome,electron --ops handle-canvas,handle-dnd --occlusion visible \
  --lanes pinned,newest,cua,cua:before --variant 'before=--drag-step-us 500' "$@"
