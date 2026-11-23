#!/bin/bash
# Task 89 (pre-flight C22, ruling 755): M4's re-judge of ruling 680 (the witness span's limit on a late take's drop),
# read-only, over the V5 rerun's stored rows with H's harness, and its controls. Not a verdict: what it says.
set -u
M=/Users/new/.local/share/cua-171/task89/rejudge-680
H=/Users/new/Developer/GitHub/cua/.claude/worktrees/t5-x64
R=/Users/new/.local/share/cua-171/m5/out-x64-rerun1/V5.pinned-release/run/results.jsonl
T=/Users/new/.local/share/cua-171/task89
echo "== rejudge-late-take-window.mjs $H $R"
node "$M/rejudge-late-take-window.mjs" "$H" "$R"
echo "== exit $?"
echo "== controls: $(head -c 0 /dev/null)rejudge-late-take-controls.mjs"
sed -n '1,12p' "$M/rejudge-late-take-controls.mjs" | grep '^//' | grep -i usage
node "$M/rejudge-late-take-controls.mjs" "$H" "$R"
echo "== exit $?"
