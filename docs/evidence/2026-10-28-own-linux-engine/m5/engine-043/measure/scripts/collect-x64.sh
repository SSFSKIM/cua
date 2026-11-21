#!/bin/bash
# Task 132: x64 D1 runs copied into the evidence: the summary, the rows gzipped, the engines' --stats lines tarred, the
# runner's step record, and the step table (d1-tables.mjs) of every run.
# usage: collect-x64.sh <run>...
set -u
T=/Users/new/.local/share/cua-171/task132
E=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/m5-measure-043/docs/evidence/2026-10-28-own-linux-engine/m5/engine-043/measure/x64
mkdir -p "$E"
cp "$T/x64/d1.log" "$E/d1.log"
for r in "$@"; do
  mkdir -p "$E/$r"
  cp "$T/x64/$r/run/summary.md" "$T/x64/$r/step.json" "$E/$r/"
  gzip -c "$T/x64/$r/run/results.jsonl" > "$E/$r/results.jsonl.gz"
  tar czf "$E/$r/engine-stats.tgz" -C "$T/x64/$r/run" engine-stats
  /usr/bin/node "$T/scripts/d1-tables.mjs" "$T/x64/$r/run" > "$E/$r/step-table.md"
done
du -sh "$E"
