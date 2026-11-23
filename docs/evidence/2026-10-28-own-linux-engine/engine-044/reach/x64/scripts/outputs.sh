#!/bin/bash
# Task 148: the read-only extracts over the H9 out root, written beside this script, display-free: the step table
# (step-table.mjs), the settle rests per step from the rows (rests.py), and L4d's parts with the gate split, derived
# (task 135's l4d-h8.mjs, unchanged).
set -u
T=/Users/new/.local/share/cua-171/task148
O=/Users/new/.local/share/cua-171/m5/out-x64-h9
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/t148-x64
node "$T/step-table.mjs" "$O" "$G" pinned-release H1,H2,L4a,L4d > "$T/step-table.md" 2>&1
echo "step-table exit $?"
(cd "$O" && python3 -I "$T/rests.py" H1.pinned-release/run/results.jsonl H2.pinned-release/run/results.jsonl L4a.pinned-release/run/results.jsonl L4d.pinned-release/run/results.jsonl) > "$T/rests.txt" 2>&1
echo "rests exit $?"
node "$T/l4d-h8.mjs" "$G" "$O/L4d.pinned-release/run/results.jsonl" > "$T/l4d-parts.txt" 2>&1
echo "l4d-parts exit $?"
