#!/bin/bash
# Task 54: copies the baseline and the two guarded :0 runs into m4/person-display-live/task54/, large files gzipped by
# task 49's evidence.py (the decoy sockets, pid files and markers left out), with this task's own scripts. The guards
# themselves are task 50's, unchanged (../scripts/).
set -u
E=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m4/person-display-live/task54
R=/Users/new/.local/share/cua-171/task54/runs
S=/Users/new/.local/share/cua-171/task54/scripts
rm -rf "$E/runs" "$E/scripts"
mkdir -p "$E/runs" "$E/scripts"
python3 -I /Users/new/.local/share/cua-171/task49/scripts/evidence.py "$R/baseline" "$E/runs/baseline" > /dev/null
python3 -I /Users/new/.local/share/cua-171/task49/scripts/evidence.py "$R/device-gtk4" "$E/runs/device-gtk4" > /dev/null
python3 -I /Users/new/.local/share/cua-171/task49/scripts/evidence.py "$R/run-bus" "$E/runs/run-bus" > /dev/null
cp "$R/device-gtk4.out" "$E/runs/device-gtk4/runner.out"
cp "$R/run-bus.out" "$E/runs/run-bus/runner.out"
rm -f "$E"/runs/*/start.marker
cp "$S/device-gtk4.sh" "$S/run-bus.sh" "$S/check54.py" "$S/copy54.sh" "$E/scripts/"
du -sh "$E"
find "$E" -type f | wc -l
