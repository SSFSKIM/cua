#!/bin/bash
# Task 129: the read-only extracts over the two counted step directories, written beside this script: each step's bands,
# press-mark binding and identification (h7-bands.mjs), its late takes judged in full (late-takes.mjs), its
# identification count (ident-count.mjs), and settle-check over both. Display-free.
set -u
T=/Users/new/.local/share/cua-171/task129
O=/Users/new/.local/share/cua-171/m5/out-x64-h7
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/t129-x64
for s in C1 L4c; do
  node "$T/h7-bands.mjs" "$O/$s.pinned-release/run/results.jsonl" > "$T/bands-$s.txt"
  node "$T/late-takes.mjs" "$O/$s.pinned-release/run/results.jsonl" > "$T/late-takes-$s.txt"
done
node "$T/ident-count.mjs" "$O/C1.pinned-release" "$O/L4c.pinned-release" > "$T/ident-count.txt"
node "$G/scripts/linux-engine-gate/settle-check.mjs" "$O/C1.pinned-release" "$O/L4c.pinned-release" > "$T/settle.txt" 2>&1
echo "settle-check exit $?" >> "$T/settle.txt"
