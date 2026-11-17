#!/bin/bash
# Task 77: a ruling's re-judge on one stored gate step of the second candidate. usage: rejudge.sh <step> [script, default rejudge-302]
#   writes gate/out-c2/<step>.<script>.txt; the script reads the stored rows through the gate checkout's own judge functions
set -u
H=/Users/new/Developer/GitHub/cua/.claude/worktrees/t77-gate
S=${2:-rejudge-302}
SCRIPT=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m4/gate/scripts/$S.mjs
O=/Users/new/.local/share/cua-171/gate/out-c2
node "$SCRIPT" "$H" "$O/$1.release-gate/run/results.jsonl" > "$O/$1.$S.txt" 2>&1
code=$?
cat "$O/$1.$S.txt"; echo "exit $code"
