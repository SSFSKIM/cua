#!/bin/bash
# Task 123: the README's tables from the out roots (read-only): the step tables of the private steps and of V5's
# sitting, and settle-check over each root, into task123/.
set -u
T=/Users/new/.local/share/cua-171/task123
M=/Users/new/.local/share/cua-171/m5
W=/Users/new/Developer/GitHub/cua/.claude/worktrees/t123-x64
node "$T/step-table.mjs" "$M/out-x64-h6" "$W" pinned-release > "$T/step-table-out.md"
node "$T/step-table.mjs" "$M/zero-x64-h6" "$W" pinned-release V5 > "$T/step-table-zero.md"
"$T/settle.sh" settle-counted "$M/out-x64-h6" pinned-release > /dev/null
"$T/settle.sh" settle-zero "$M/zero-x64-h6" pinned-release > /dev/null
echo "tables written"
