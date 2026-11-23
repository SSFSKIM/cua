#!/bin/bash
# Task 87: the pilot's step table and its lock lines, rebuilt from the out root and the host lock's log.
set -u
T=/Users/new/.local/share/cua-171/task87/x64
node "$T/pilot-table.mjs" /Users/new/.local/share/cua-171/m5/pilot-x64/out /Users/new/Developer/GitHub/cua/.claude/worktrees/t87-pilot > "$T/pilot-table.md"
grep " t87-pilot " /Users/new/.local/share/cua-171/host-lock.log | grep -v " wait " | cut -c1-260 > "$T/lock-lines.txt"
wc -l "$T/pilot-table.md" "$T/lock-lines.txt"
