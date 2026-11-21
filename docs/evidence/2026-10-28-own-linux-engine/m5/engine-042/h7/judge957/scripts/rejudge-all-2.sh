#!/bin/bash
# task 128: every stored drop-signals run re-judged by H7's judge and by Part 2's (rejudge957.mjs), and every stored
# verdict run's device cases by rejudge-device.mjs with H7's device.mjs as the former judge. Offline, read-only.
set -u
T=/Users/new/.local/share/cua-171/task128
OLD=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/m5-h7-128-p1
NEW=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/m5-h7-128
E=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m5
echo "old $(git -C "$OLD" rev-parse --short HEAD) new $(git -C "$NEW" rev-parse --short HEAD)"
node "$T/inventory.mjs" /Users/new/.local/share/cua-171/m5 "$E" "$T/vm-rows" > "$T/inventory.txt"
cut -f1 "$T/inventory.txt" | while read -r f; do grep -q "	-	" <<< "$(grep -F "$f	" "$T/inventory.txt")" || echo "$f"; done > "$T/drop-files.txt"
grep -P "\t-\t" "$T/inventory.txt" | cut -f1 > "$T/device-files.txt"
echo "drop-signals files $(wc -l < "$T/drop-files.txt"), verdict files $(wc -l < "$T/device-files.txt")"
xargs -d '\n' node "$T/rejudge957.mjs" --old "$OLD/scripts/linux-engine-diff/drop-signals-judge.mjs" --new "$NEW/scripts/linux-engine-diff/drop-signals-judge.mjs" < "$T/drop-files.txt" > "$T/rejudge-drops-2.jsonl"
echo "drop-signals runs judged: $(wc -l < "$T/rejudge-drops-2.jsonl")"
: > "$T/rejudge-device-2.jsonl"
while read -r f; do
  echo "== $f" >> "$T/rejudge-device-2.jsonl"
  node "$NEW/scripts/linux-engine-diff/rejudge-device.mjs" --diagnostic --old "$OLD/scripts/linux-engine-diff/device.mjs" "$f" >> "$T/rejudge-device-2.jsonl" 2>&1
  echo "exit $?" >> "$T/rejudge-device-2.jsonl"
done < "$T/device-files.txt"
echo done
