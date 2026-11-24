#!/bin/bash
# Task 162 (task 148's outputs.sh): the read-only extracts over the H10 out root, written beside this script,
# display-free: the step table (step-table.mjs), the settle rests per step from the rows (rests.py), L4d's parts with
# the gate split, derived (task 135's l4d-h8.mjs, unchanged: its derived gate and schedule are 0.4.3's rule and do not
# know #512's overran rows), and the L4d Chrome rows' own release_sync table (release-sync.mjs, task 162).
set -u
T=/Users/new/.local/share/cua-171/task162
O=/Users/new/.local/share/cua-171/m5/out-x64-h10
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/t162-x64
node "$T/step-table.mjs" "$O" "$G" pinned-release H1,H2,L4a,L4d > "$T/step-table.md" 2>&1
echo "step-table exit $?"
(cd "$O" && python3 -I "$T/rests.py" H1.pinned-release/run/results.jsonl H2.pinned-release/run/results.jsonl L4a.pinned-release/run/results.jsonl L4d.pinned-release/run/results.jsonl) > "$T/rests.txt" 2>&1
echo "rests exit $?"
node "$T/l4d-h8.mjs" "$G" "$O/L4d.pinned-release/run/results.jsonl" > "$T/l4d-parts.txt" 2>&1
echo "l4d-parts exit $?"
node "$T/release-sync.mjs" "$O/L4d.pinned-release/run/results.jsonl" > "$T/release-sync.txt" 2>&1
echo "release-sync exit $?"
