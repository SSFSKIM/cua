#!/bin/bash
# Firefox's held drag_handle moves: the spacing sweep the design session asked for (2026-11-08), with and without
# Gecko's lead pause, every lane the same handle requests 10 ms apart (the service's drag_handle settle).
# usage: ff-held-sweep.sh <name> <candidate> [extra args]
set -u
d=$(dirname "$0")
name=$1
cand=$2
shift 2
exec "$d/drag.sh" <home>/.local/share/cua-171/task66/harness-04732370 "$name" "$cand" --family firefox --ops handle-canvas,handle-dnd --occlusion visible \
  --lanes pinned,newest,cua,cua:h1,cua:h2,cua:h4,cua:h6,cua:h8,cua:h4L,cua:h8L \
  --variant 'h1=--drag-step-us 300 --drag-release-dwell-ms 30 --held-step-ms 1' \
  --variant 'h2=--drag-step-us 300 --drag-release-dwell-ms 30 --held-step-ms 2' \
  --variant 'h4=--drag-step-us 300 --drag-release-dwell-ms 30 --held-step-ms 4' \
  --variant 'h6=--drag-step-us 300 --drag-release-dwell-ms 30 --held-step-ms 6' \
  --variant 'h8=--drag-step-us 300 --drag-release-dwell-ms 30 --held-step-ms 8' \
  --variant 'h4L=--drag-step-us 300 --drag-release-dwell-ms 30 --held-step-ms 4 --held-lead-pause' \
  --variant 'h8L=--drag-step-us 300 --drag-release-dwell-ms 30 --held-step-ms 8 --held-lead-pause' \
  "$@"
