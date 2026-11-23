#!/bin/bash
# Task 105: D1's cross-check (pre-flight §8.1 point 2): its H'''' record against its H record in m5/x64/out/, by
# compare-drag.mjs, into crosscheck-D1.txt; then each summary's verdict line and the step's end.
set -u
D=/Users/new/.local/share/cua-171
H=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m5/x64/out/D1.pinned-release/run/summary.md
N=$D/m5/out-x64-h4/D1.pinned-release/run/summary.md
node "$D/task105/compare-drag.mjs" "$H" "$N" > "$D/task105/crosscheck-D1.txt"
echo "compare exit $?" >> "$D/task105/crosscheck-D1.txt"
cat "$D/task105/crosscheck-D1.txt"
echo "--- D1 at H'''' end:"
tail -4 "$D/m5/out-x64-h4/D1.driver.out" | cut -c1-300
grep -n '^candidate:' "$N" | cut -c1-200
