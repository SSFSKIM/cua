#!/bin/bash
# Firefox's held moves at twice the load: the held rest at 20 (as built), 30 and 40 ms, beside the spacing alternative.
# usage: ff-held-rest-load.sh <name> <candidate> [extra args]
set -u
d=$(dirname "$0")
name=$1
cand=$2
shift 2
gecko='--drag-step-us 300 --drag-elapsed --drag-rest-ms 20 --drag-release-dwell-ms 30'
exec "$d/drag.sh" "$HOME/.local/share/cua-171/task66/harness-ae04d620" "$name" "$cand" --family firefox --ops handle-canvas,handle-dnd \
  --occlusion visible --load-factor 2 --lanes pinned,cua,cua:hr30,cua:hr40,cua:h6L \
  --variant "hr30=$gecko --held-rest-ms 30" \
  --variant "hr40=$gecko --held-rest-ms 40" \
  --variant 'h6L=--drag-step-us 300 --drag-release-dwell-ms 30 --held-step-ms 6 --held-lead-pause' "$@"
