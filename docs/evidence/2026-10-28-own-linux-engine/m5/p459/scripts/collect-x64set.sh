#!/bin/bash
# Task 126: one x64 p459 set (p459-x64.sh) into the evidence: its tables, rows and runs (summaries, results, stats).
# usage: collect-x64set.sh <set>
set -u
S=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/m5-p459-scratch
E=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/m5-p459/docs/evidence/2026-10-28-own-linux-engine/m5/p459/x64/$1
R=/Users/new/.local/share/cua-171/task126/x64/$1
mkdir -p "$E"
node "$S/p459-tables.mjs" "$R" > "$E/tables.md"
node "$S/p459-tables.mjs" "$R" --rows | grep '^{' | gzip -c > "$E/rows.jsonl.gz"
(cd "$R" && tar czf - $(ls -d p459.jsonl result.json */r*/run/summary.md */r*/run/results.jsonl */r*/run/engine-stats 2>/dev/null)) > "$E/runs.tar.gz"
cp "$S/collect-x64set.sh" "$E/../../scripts/"
du -sh "$E"
