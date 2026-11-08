#!/bin/bash
# Firefox's held drag_handle moves, round 2: the spacing sweep's smallest landing values around the vendor's 8 ms with
# the lead pause, beside a held move that rests at its end and visits it again (the plain drag's model).
# usage: ff-held-2.sh <name> <candidate> [extra args]
set -u
d=$(dirname "$0")
name=$1
cand=$2
shift 2
base='--drag-step-us 300 --drag-release-dwell-ms 30'
exec "$d/drag.sh" <home>/.local/share/cua-171/task66/harness-04732370 "$name" "$cand" --family firefox --ops handle-canvas,handle-dnd --occlusion visible \
  --lanes pinned,newest,cua,cua:h6L,cua:h7L,cua:h8L,cua:r10,cua:r20,cua:r20L \
  --variant "h6L=$base --held-step-ms 6 --held-lead-pause" \
  --variant "h7L=$base --held-step-ms 7 --held-lead-pause" \
  --variant "h8L=$base --held-step-ms 8 --held-lead-pause" \
  --variant "r10=$base --drag-rest-ms 10" \
  --variant "r20=$base --drag-rest-ms 20" \
  --variant "r20L=$base --drag-rest-ms 20 --held-lead-pause" \
  "$@"
