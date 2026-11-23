#!/bin/bash
# Task 130: x64 D1's set into the evidence (summary, step cost, rows gzipped, engine stats gzipped).
set -u
T=/Users/new/.local/share/cua-171/task130
P=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/m5-p459/docs/evidence/2026-10-28-own-linux-engine/m5/p459
E=$P/tail/x64/d1-a
mkdir -p "$E"
cp "$T/x64/d1-a/run/summary.md" "$E/"
gzip -c "$T/x64/d1-a/run/results.jsonl" > "$E/results.jsonl.gz"
tar -C "$T/x64/d1-a/run" -czf "$E/engine-stats.tgz" engine-stats
node "$P/scripts/d1-tables.mjs" "$T/x64/d1-a/run" > "$E/step-cost.md"
ls -la "$E"
