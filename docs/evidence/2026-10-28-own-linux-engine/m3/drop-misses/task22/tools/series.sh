#!/bin/bash
# series.sh: step A's runs after hold1, one after another, on the keep-alive scratch engine with the gate's ballast.
S=/Users/new/.local/share/cua-171/task22/scratch
"$S/run-b.sh" hold2 30 500 - gate
CUA_SCRATCH_DRAG_STEP_US=0 "$S/run-b.sh" fast1 20 500 - gate
"$S/run-b.sh" warm1 15 500 chrome_dnd_short_in_front_shared gate
echo done > "$S/runs/series.done"
