#!/bin/bash
# The final idle sittings on a candidate: every Chromium and Gecko kind, plain and held, beside the family's pacing
# before T11 (`cua:before`, the control).
# usage: final-idle.sh <name> <candidate> [extra args]
set -u
d=$(dirname "$0")
name=$1
cand=$2
shift 2
h=$HOME/.local/share/cua-171/task66/harness-d92a56f6
ops=select,range,scroller,dnd,canvas,handle-canvas,handle-dnd
"$d/drag.sh" "$h" "$name-firefox" "$cand" --family firefox --ops $ops --occlusion visible --lanes pinned,newest,cua,cua:before \
  --variant 'before=--drag-step-us 300 --drag-release-dwell-ms 30 --held-lead-pause' "$@"
"$d/drag.sh" "$h" "$name-chromium" "$cand" --family chrome,electron --ops $ops --occlusion visible --lanes pinned,newest,cua,cua:before \
  --variant 'before=--drag-step-us 500' "$@"
