#!/bin/bash
# Task 77: rejudge-302's amended desktop condition applied to L3b and S1 (both candidates), and its controls.
set -u
G=/Users/new/.local/share/cua-171/gate
S=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m4/gate/scripts
H2=/Users/new/Developer/GitHub/cua/.claude/worktrees/t77-gate
H1=/Users/new/Developer/GitHub/cua/.claude/worktrees/t76-gate
C1OUT=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m4/gate/out
/Users/new/.local/share/cua-171/task77/rejudge.sh L3b | tail -4
/Users/new/.local/share/cua-171/task77/rejudge.sh S1 | tail -3
node "$S/rejudge-302.mjs" "$H1" "$G/out/S1.release-gate/run/results.jsonl" > "$G/out-c2/S1-candidate1.rejudge-302-amended.txt"
echo "candidate 1 S1 exit $?"
if diff <(grep -v '^#\|^label' "$C1OUT/S1.rejudge-302.txt") <(grep -v '^#\|^label' "$G/out-c2/S1-candidate1.rejudge-302-amended.txt") > /dev/null; then echo "candidate 1 S1: output identical to the committed one"; else echo "candidate 1 S1: output DIFFERS"; fi
node "$S/rejudge-302-amend-controls.mjs" "$H2" "$G/out-c2/L3b.release-gate/run/results.jsonl" "$G/out-c2/S1.release-gate/run/results.jsonl" "$G/out/S1.release-gate/run/results.jsonl" "$H1" | tee "$G/out-c2/rejudge-302-amend-controls.txt"
