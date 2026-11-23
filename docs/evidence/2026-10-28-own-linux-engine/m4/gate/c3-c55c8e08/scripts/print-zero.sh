#!/bin/bash
# Task 79 (from task 77): the :0 steps' commands for the third candidate, printed by the gate checkout into gate/out-c3.
set -u
GATE=/Users/new/Developer/GitHub/cua/.claude/worktrees/t79-gate
for s in "$@"; do
  echo "== $s"
  node "$GATE/scripts/linux-engine-gate/gate.mjs" print "$s" --candidate /Users/new/.local/share/cua-171/gate/artifact-c3/cua-engine-0.4.0-linux-x64 --out /Users/new/.local/share/cua-171/gate/out-c3
done
