#!/bin/bash
# Task 132 (from task 130's collect-arm.sh): arm64 sets fetched into the evidence: the tables (t132-tables.mjs on the
# VM, judged by the harness's own judge under <judge plan>), the classed rows, and per run the summary, the rows and
# the engines' --stats lines, gzipped. The VM's own copy stays in place.
# usage: collect-arm.sh <set>:<judge plan>...
set -u
E=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/m5-measure-043/docs/evidence/2026-10-28-own-linux-engine/m5/engine-043/measure/arm64
R=/Users/new/.local/share/cua-171/task132/out
N=/Users/new/.local/share/cua-171/node24/bin/node
S=/Users/new/.local/share/cua-171/task132/scripts/t132-tables.mjs
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t132-h71
mkdir -p "$E"
scp -q "cua-171-arm64:$R/t132.log" "$E/t132.log"
for arg in "$@"; do
  set=${arg%%:*}; plan=${arg#*:}
  mkdir -p "$E/$set"
  ssh cua-171-arm64 "$N $S $G $R/$set $plan" > "$E/$set/tables.md"
  ssh cua-171-arm64 "$N $S $G $R/$set $plan --rows | grep '^{' | gzip -c" > "$E/$set/rows.jsonl.gz"
  ssh cua-171-arm64 "cd $R/$set && tar czf - \$(ls -d t132.jsonl result.json */r*/run/summary.md */r*/run/results.jsonl */r*/run/engine-stats 2>/dev/null)" > "$E/$set/runs.tar.gz"
done
du -sh "$E"
