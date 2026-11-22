#!/bin/bash
# Task 130 (from task 126): one arm64 set fetched into the evidence (its tables, from p459-tables.mjs on the VM, and per run the
# summary, the rows and the engines' --stats lines, gzipped), the VM's own copy left in place.
# usage: collect-arm.sh <set>...
set -u
P=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/m5-p459
E=$P/docs/evidence/2026-10-28-own-linux-engine/m5/p459/tail/arm64
R=/Users/new/.local/share/cua-171/task130/out
mkdir -p "$E"
scp -q "cua-171-arm64:$R/p459.log" "$E/p459.log"
for set in "$@"; do
  mkdir -p "$E/$set"
  ssh cua-171-arm64 "/Users/new/.local/share/cua-171/node24/bin/node /Users/new/.local/share/cua-171/task130/p459-tables.mjs $R/$set" > "$E/$set/tables.md"
  ssh cua-171-arm64 "/Users/new/.local/share/cua-171/node24/bin/node /Users/new/.local/share/cua-171/task130/p459-tables.mjs $R/$set --rows | grep '^{' | gzip -c" > "$E/$set/rows.jsonl.gz"
  ssh cua-171-arm64 "cd $R/$set && tar czf - \$(ls -d p459.jsonl result.json */r*/run/summary.md */r*/run/results.jsonl */r*/run/engine-stats 2>/dev/null)" > "$E/$set/runs.tar.gz"
done
du -sh "$E"
for set in "$@"; do ssh cua-171-arm64 "python3 /Users/new/.local/share/cua-171/task130/act.py $R/$set" > "$E/$set/activation.md"; done
