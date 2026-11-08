#!/bin/bash
# Task 65's fix-wave sittings, one after another, on d8d5b552's harness (private displays only, drag.sh).
set -u
S=$HOME/.local/share/cua-171/task65/scripts
H=$HOME/.local/share/cua-171/task65/harness-d8d5b552
R=$HOME/.local/share/cua-171/task65/runs
"$S/drag.sh" "$H" fix-handle-head head --family firefox --ops handle-canvas,handle-dnd --occlusion visible --variant 'nolead=--drag-step-us 300 --drag-release-dwell-ms 30' --run t65-fix-handle-head > "$R/fix-handle-head.out" 2>&1
tail -1 "$R/fix-handle-head.out"
"$S/drag.sh" "$H" fix-idle-released released --family chrome,electron,firefox --ops scroller,canvas,dnd --occlusion visible --run t65-fix-idle-released > "$R/fix-idle-released.out" 2>&1
tail -1 "$R/fix-idle-released.out"
"$S/drag.sh" "$H" fix-load2-released released --family chrome,electron --ops scroller,range --occlusion visible --lanes pinned,cua --load-factor 2 --run t65-fix-load2-released > "$R/fix-load2-released.out" 2>&1
tail -1 "$R/fix-load2-released.out"
