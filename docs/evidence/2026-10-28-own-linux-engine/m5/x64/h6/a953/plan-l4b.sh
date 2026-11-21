#!/bin/bash
# Task 123, ruling 953: L4b's launch as the H6 runner gives it, dry (task 121's launch-plan.mjs), so the twin's launch
# is L4b's with only its plan swapped. Output plan-l4b.txt beside this script.
set -u
T=/Users/new/.local/share/cua-171/task123/a953
rm -rf "$T/lp-out"
node /Users/new/Developer/GitHub/cua/.claude/worktrees/t123-x64/scripts/linux-engine-gate/launch-plan.mjs \
  --pinned /Users/new/.local/share/cua-171/m5/home-x64-042 --out "$T/lp-out" > "$T/launch-plan-all.txt" 2>&1
echo "launch-plan exit $?"
awk '/^== L4b( |$)/{p=1; print; next} /^== /{p=0} p' "$T/launch-plan-all.txt" > "$T/plan-l4b.txt"
wc -l "$T/plan-l4b.txt"
