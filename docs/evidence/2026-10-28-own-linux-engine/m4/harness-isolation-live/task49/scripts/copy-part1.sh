#!/bin/bash
# Task 49: part 1's sessions into the repository's evidence directory (scripts included).
set -eu
cd /Users/new/.local/share/cua-171/task49
E=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m4/harness-isolation-live/task49
for s in appbus probe gte smoke-2; do python3 -I scripts/analyze.py runs/$s > runs/$s/analysis.jsonl; done
python3 -I scripts/evidence.py runs/part1 $E/runs/part1 runs/part1-results > /dev/null
for s in appbus probe gte smoke-2; do python3 -I scripts/evidence.py runs/$s $E/runs/$s > /dev/null; done
mkdir -p $E/scripts
for f in wrap.py session.mjs norecord.mjs appbus.mjs probe.mjs owner-check.sh owner-watch.sh stop-watch.sh analyze.py evidence.py copy-part1.sh; do cp scripts/$f $E/scripts/; done
cp scripts/run-session-abs.sh $E/scripts/run-session.sh
for p in phases-smoke phases-part1 phases-appbus phases-probe phases-gte phases-part2 phases-part2b; do cp $p.json $E/scripts/; done
du -sh $E
find $E -type f | wc -l
