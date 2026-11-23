#!/bin/bash
# task 73: the candidate pre-press grab check on a scratch private Xvfb (never :0) with Openbox and an xterm: does it
# cross the window under the pointer, and does it see another client's grab? Builds the tool first (under the lock).
set -u
T=$HOME/.local/share/cua-171/task73
(cd "$T/probes/xgrab" && cargo build --release --offline) || exit 1
G=$T/probes/xgrab/target/release/xgrab
Xvfb :174 -screen 0 1280x800x24 -nolisten tcp > "$T/xvfb174.log" 2>&1 &
xp=$!
sleep 2
export DISPLAY=:174 T73_SCRATCH_DISPLAY=:174
xprop -root -f CUA171_PRIVATE_DISPLAY 8s -set CUA171_PRIVATE_DISPLAY 1; xprop -root CUA171_PRIVATE_DISPLAY
openbox & wm=$!
sleep 2
xterm -geometry 80x24+100+100 & xt=$!
sleep 1.5
xdotool mousemove 300 200
sleep 0.3
for n in 1 2 3 4 5; do echo "free: $("$G" check)"; done
"$G" hold 1500 > "$T/hold.out" &
sleep 0.3
for n in 1 2 3; do echo "held by another: $("$G" check)"; done
wait %4 2>/dev/null
sleep 1.5
echo "after release: $("$G" check)"
kill $xt $wm $xp
