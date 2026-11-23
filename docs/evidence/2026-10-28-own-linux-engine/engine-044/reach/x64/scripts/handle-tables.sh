#!/bin/bash
# Task 148: item 3's set judged by task 132's t132-tables.mjs (H9's own chromeDropVerdict per row, joined to --stats),
# judged as plan none as task 132 judged its handle sets, into handle-tables.md. Display-free.
T=/Users/new/.local/share/cua-171/task148
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/t148-x64
node "$T/scripts/t132-tables.mjs" "$G" "$T/out/handle-x64" none > "$T/handle-tables.md" 2>&1
echo "tables exit $?"
