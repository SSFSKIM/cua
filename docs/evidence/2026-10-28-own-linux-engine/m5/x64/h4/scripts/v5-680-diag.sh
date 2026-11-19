#!/bin/bash
# Task 105: a diagnostic only (not a verdict, never cited as a pass): ruling 680's late-take re-judge as task 89 ran it
# (task89/rejudge-680/, read-only), over the H'''' V5's stored rows with the t105-x64 harness, and its controls.
set -u
M=/Users/new/.local/share/cua-171/task89/rejudge-680
H=/Users/new/Developer/GitHub/cua/.claude/worktrees/t105-x64
R=/Users/new/.local/share/cua-171/m5/zero-x64-h4/V5.pinned-release/run/results.jsonl
echo "== rejudge-late-take-window.mjs"
node "$M/rejudge-late-take-window.mjs" "$H" "$R"
echo "== exit $?"
echo "== controls"
node "$M/rejudge-late-take-controls.mjs" "$H" "$R"
echo "== exit $?"
