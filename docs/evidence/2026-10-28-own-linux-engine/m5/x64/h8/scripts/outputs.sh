#!/bin/bash
# Task 135: the read-only extracts over the H8 out root, written beside this script, display-free:
#  - the step table (step-table.mjs) and settle-check over every step directory;
#  - C1's and L4c's bands, binding and identification (h7-bands.mjs) and their late takes judged in full (late-takes.mjs);
#  - every Chrome step's identification counts (ident-count.mjs);
#  - L4d's parts with the gate split, derived (l4d-h8.mjs);
#  - the H1 cross-check against H6's record (h1-compare.mjs).
# Each is run only for the steps whose directories exist.
set -u
T=/Users/new/.local/share/cua-171/task135
O=/Users/new/.local/share/cua-171/m5/out-x64-h8
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/t129-x64
H6=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m5/x64/h6/out
res() { ls "$O/$1.pinned-release/run/results.jsonl"* 2>/dev/null | head -1; }
node "$T/step-table.mjs" "$O" "$G" pinned-release > "$T/step-table.md"
node "$G/scripts/linux-engine-gate/settle-check.mjs" "$O"/*.pinned-release > "$T/settle.txt" 2>&1
echo "settle-check exit $?" >> "$T/settle.txt"
for s in C1 L4c; do
  f=$(res $s); [ -n "$f" ] || continue
  node "$T/h7-bands.mjs" "$f" > "$T/bands-$s.txt"
  node "$T/late-takes.mjs" "$f" > "$T/late-takes-$s.txt"
done
dirs=(); for s in D1 C1 K1 K2 K3 L2a L4b L4c L4d; do [ -d "$O/$s.pinned-release" ] && dirs+=("$O/$s.pinned-release"); done
[ ${#dirs[@]} -gt 0 ] && node "$T/ident-count.mjs" "${dirs[@]}" > "$T/ident-count.txt"
f=$(res L4d); [ -n "$f" ] && node "$T/l4d-h8.mjs" "$G" "$f" > "$T/l4d-parts.txt"
if [ -f "$O/H1.pinned-release/run/summary.md" ]; then
  node "$T/h1-compare.mjs" "$H6/H1.pinned-release/run/summary.md" "$O/H1.pinned-release/run/summary.md" > "$T/h1-crosscheck.txt"
  echo "h1-compare exit $?" >> "$T/h1-crosscheck.txt"
fi
echo "outputs written"
