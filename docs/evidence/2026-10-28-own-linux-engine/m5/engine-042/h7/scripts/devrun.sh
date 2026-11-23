#!/bin/bash
# task 125 (ruling 954): one development run of the replanned t14-late on x64 (step C1, idle, a private display) against
# the pinned 0.4.2 engine of a run-owned home.
set -u
repo=/Users/new/Developer/GitHub/cua/.claude/worktrees/agent-a4d8cf4660dd54f80
T=/Users/new/.local/share/cua-171/task125
home=/Users/new/.local/share/cua-171/task121/home/.local/share/cua
cd "$repo"
echo "head $(git rev-parse HEAD) clean=$(git status --porcelain | wc -l)"
node scripts/linux-engine-gate/gate.mjs run C1 --pinned "$home" --dev --out "$T/gate-dev" --holder m5-h7 > "$T/gate-dev-C1.log" 2>&1
echo "C1 (development run) exit $?"
