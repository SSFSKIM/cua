#!/bin/bash
# Task 96: a verdict step's cua rows by verdict class, and its summary's closing lines (read only).
# usage: verdicts.sh <step dir>...
for d in "$@"; do
  f=$d/run/summary.md
  echo "## $(basename "$d"): all-clear $(head -1 "$d/all-clear.txt" 2>/dev/null | cut -c1-80)"
  [ -f "$f" ] || { echo "   no summary"; continue; }
  awk -F'|' '/^\| / && $4 ~ /cua/ {v=$(NF-1); gsub(/^ +| +$/, "", v); sub(/[:(].*/, "", v); c[v]++} END {for (k in c) printf "   %s: %d\n", k, c[k]}' "$f"
  grep -nE 'FAIL|false ok|declared gap|declared refusal|declared unconfirmed|run valid|no verdict' "$f" | grep -v '^[0-9]*:|' | cut -c1-300 | head -8
done
