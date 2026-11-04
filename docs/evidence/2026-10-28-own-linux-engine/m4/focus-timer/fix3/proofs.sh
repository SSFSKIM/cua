#!/bin/bash
# Task 56 fix 3's proof on the musl build of 391c6395 (the release workflow's way), every sitting on a private Xvfb.
# 1. gnome-terminal's key-then-paste at twice the load, no proxy, 200 runs (the never-taken probe's scene);
# 2. the wait's cost, the engine as it ships: 30 pastes each into gnome-terminal, gedit, Writer and Chrome, idle and at
#    twice the load (every family's window open);
# 3. the focus-timer experiment, gnome-terminal, idle and at twice the load (fresh 30-consecutive series);
# 4. the other families' key-then-paste at twice the load.
set -u
t=$HOME/.local/share/cua-171/task56-fix3
c=391c63958ea82d5a4eb636a51218d8fbad2bcc50
h=$t/live/$c
b=$HOME/.local/share/cua-171/task56/build/$c/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
cd "$t" || exit 2
"$b" --version
echo "start $(date +%T)"
timeout 5400 node probe.mjs "$h" "$b" "$t/runs/proof-terminal-load2" --direct --runs 200 > "$t/runs/proof-terminal-load2.log" 2>&1
echo "1 terminal 2x exit $? $(date +%T)"
timeout 1800 node targets-matrix.mjs "$h" "$b" "$t/runs/cost-idle" 30 none --targets gnome-terminal,gedit,writer,chrome > "$t/runs/cost-idle.log" 2>&1
echo "2 cost idle exit $? $(date +%T)"
timeout 1800 node targets-matrix.mjs "$h" "$b" "$t/runs/cost-load2" 30 none --load --targets gnome-terminal,gedit,writer,chrome > "$t/runs/cost-load2.log" 2>&1
echo "2 cost 2x exit $? $(date +%T)"
$HOME/.local/share/cua-171/task56/run-exp.sh "$h" "$b" "$t/runs/fresh-terminal-idle" \
  --experiment focus-timer --run t56-fix3-fresh-terminal-idle --family gnome-terminal
echo "3 focus-timer idle $(tail -1 "$t/runs/fresh-terminal-idle/run.log") $(date +%T)"
$HOME/.local/share/cua-171/task56/run-exp.sh "$h" "$b" "$t/runs/fresh-terminal-load2" \
  --experiment focus-timer --run t56-fix3-fresh-terminal-load2 --family gnome-terminal --load-factor 2
echo "3 focus-timer 2x $(tail -1 "$t/runs/fresh-terminal-load2/run.log") $(date +%T)"
$HOME/.local/share/cua-171/task56/run-exp.sh "$h" "$b" "$t/runs/fresh-others-paste-load2" \
  --experiment focus-timer --run t56-fix3-fresh-others-paste-load2 --family chrome,electron,gedit,kate,qtcreator,firefox,writer --scenarios paste --load-factor 2
echo "4 others 2x $(tail -1 "$t/runs/fresh-others-paste-load2/run.log") $(date +%T)"
echo "load runs ended $(date +%T)"
