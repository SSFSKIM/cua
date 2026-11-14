#!/bin/bash
# Every Chromium and Gecko kind, plain and held, at twice the load: the rows as built (rest 20 ms) beside a 30 ms rest
# for drags and held moves alike.
# usage: load-rest.sh <name> <candidate> chromium|firefox
set -u
d=$(dirname "$0")
name=$1
cand=$2
h=$HOME/.local/share/cua-171/task66/harness-ae04d620
ops=select,range,scroller,dnd,canvas,handle-canvas,handle-dnd
case "$3" in
  chromium) exec "$d/drag.sh" "$h" "$name" "$cand" --family chrome,electron --ops $ops --occlusion visible --load-factor 2 \
    --lanes pinned,cua,cua:r30 --variant 'r30=--drag-step-us 500 --drag-elapsed --drag-rest-ms 30 --held-rest-ms 30' ;;
  firefox) exec "$d/drag.sh" "$h" "$name" "$cand" --family firefox --ops $ops --occlusion visible --load-factor 2 \
    --lanes pinned,cua,cua:r30 --variant 'r30=--drag-step-us 300 --drag-elapsed --drag-rest-ms 30 --drag-release-dwell-ms 30 --held-rest-ms 30' ;;
esac
