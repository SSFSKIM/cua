#!/bin/bash
# task 80: runs one part of checks.sh under the host lock, with WT the release checkout (OLD_WT the 0.3.0-pinned
# checkout for old-install), its outer output to logs/<part>.out.
#   usage: run-part.sh <part>
set -u
T=/Users/new/.local/share/cua-171/task80
part=$1
export OLD_WT=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171
if [ "$part" = old-install ]; then export WT=$OLD_WT; else export WT=/Users/new/Developer/GitHub/cua/.claude/worktrees/t80-release; fi
mkdir -p "$T/logs"
/Users/new/.local/share/cua-171/locked.sh t80-release "$T/checks.sh" "$part" > "$T/logs/$part.out" 2>&1
s=$?
echo "$part exit $s"
exit $s
