#!/bin/bash
# Task 49: part 2's sessions into the repository's evidence directory, and smoke-1's person's-side reads into part 1's.
set -eu
cd /Users/new/.local/share/cua-171/task49
R=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m4
python3 -I scripts/analyze.py runs/part2 > runs/part2/analysis.jsonl
python3 -I scripts/analyze.py runs/part2b > runs/part2b/analysis.jsonl
python3 -I scripts/evidence.py runs/part2 $R/record-judge-acceptance/runs/attempt-1 > /dev/null
python3 -I scripts/evidence.py runs/part2b $R/record-judge-acceptance/runs/attempt-2 > /dev/null
mkdir -p $R/harness-isolation-live/task49/runs/smoke-1
cp runs/smoke-1/owner-before.txt runs/smoke-1/owner-after.txt runs/smoke-1/owner-diff.txt runs/smoke-1/owner-baseline.txt runs/smoke-1/wrap.out $R/harness-isolation-live/task49/runs/smoke-1/
cp scripts/copy-part2.sh $R/harness-isolation-live/task49/scripts/
cp scripts/stop-watch.sh scripts/session.mjs scripts/probe.mjs $R/harness-isolation-live/task49/scripts/
du -sh $R/record-judge-acceptance $R/harness-isolation-live/task49
