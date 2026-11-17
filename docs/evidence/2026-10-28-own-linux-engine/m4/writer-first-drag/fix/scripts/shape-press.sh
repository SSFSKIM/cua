#!/bin/bash
# task 72 fix: how many button-press records one real right click gives the VCL-shape fixture (private display)
# usage: xvfb-run -a dbus-run-session -- shape-press.sh
F=$HOME/Developer/GitHub/cua/.claude/worktrees/<task72fix-worktree>/native/linux-engine/tests/support/vcl-shape.py
python3 "$F" shapepress stale &
pid=$!
sleep 2
xdotool mousemove 200 177 click 3
sleep 1
kill $pid
