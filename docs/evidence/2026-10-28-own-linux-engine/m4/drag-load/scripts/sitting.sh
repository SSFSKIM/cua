#!/bin/bash
# T12's sitting (task 67): Chrome's and Electron's scrollbar thumbs and range inputs at twice the load (16 stress-ng
# workers on 8 cores), 40 drags a side, on a private display; the pinned build beside the head's musl build (`cua`,
# shipped pacing) and the head with Chromium's pacing before T11 (`cua:before`, 500 µs a sample, no rest: the control).
# usage: sitting.sh <harness dir of the head> <name>
set -u
d=$(dirname "$0")
exec "$d/drag.sh" "$1" "$2" head --family chrome,electron --ops scroller,range --occlusion visible --load-factor 2 \
  --lanes pinned,cua,cua:before --variant 'before=--drag-step-us 500' --run "t67-$2"
