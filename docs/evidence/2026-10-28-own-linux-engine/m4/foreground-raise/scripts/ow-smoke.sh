#!/bin/bash
# order-watch smoke test on a private Xvfb (never :0)
set -u
P=$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171/scripts/linux-engine-diff/xprobe/target/release/xprobe
Xvfb :163 -screen 0 1280x800x24 -noreset >/dev/null 2>&1 &
X=$!
sleep 1
export DISPLAY=:163
(sleep 3 | "$P" order-watch > /tmp/ow-test.jsonl 2>&1) &
sleep 0.5
xdotool mousemove 100 100 click 1
sleep 0.3
xdotool click 3
sleep 3
cat /tmp/ow-test.jsonl
kill $X
