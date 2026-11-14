#!/bin/bash
# Task 77: the :0 steps' commands for the second candidate, printed by the gate checkout into gate/out-c2.
set -u
GATE=/Users/new/Developer/GitHub/cua/.claude/worktrees/t77-gate
for s in "$@"; do
  echo "== $s"
  node "$GATE/scripts/linux-engine-gate/gate.mjs" print "$s" --candidate /Users/new/.local/share/cua-171/gate/artifact-c2/cua-engine-0.4.0-linux-x64 --out /Users/new/.local/share/cua-171/gate/out-c2
done
