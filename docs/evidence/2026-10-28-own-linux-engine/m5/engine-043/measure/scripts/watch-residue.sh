#!/bin/bash
# Task 132: watch a running arm64 set for any false ok or stale drop on a lane's long-left cell (the stop rule); prints
# one line and exits on the first, or when the set ends clean.
# usage: watch-residue.sh <set> <lane>
set -u
set_=$1; lane=$2
while true; do
  out=$(ssh cua-171-arm64 "/Users/new/.local/share/cua-171/node24/bin/node ~/.local/share/cua-171/task132/scripts/t132-tables.mjs /Users/new/Developer/GitHub/cua/.claude/worktrees/t132-h71 ~/.local/share/cua-171/task132/out/$set_ none 2>&1 | grep '^| $lane | long-left '; grep -c '$set_: end' ~/.local/share/cua-171/task132/out/t132.log" 2>&1 || true)
  bad=$(echo "$out" | awk -F'|' 'NF > 15 && $3 ~ /long-left/ && ($7+0>0 || $8+0>0) {print}')
  [ -n "$bad" ] && { echo "RESIDUE on $set_ $lane: $bad"; exit 0; }
  echo "$out" | tail -1 | grep -q '^1$' && { echo "$set_ ended: $(echo "$out" | head -1 | cut -c1-80)"; exit 0; }
  sleep 90
done
