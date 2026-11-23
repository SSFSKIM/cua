#!/bin/bash
# Task 96: the settle cells with any miss, from S-step summaries (read only). usage: settle-misses.sh <summary.md>...
for f in "$@"; do
  echo "## $f"
  awk -F"|" '/^\| / && NF>=7 && $5 ~ /\(/ && $5 !~ /^ *0 \(0 \/ 0 \/ 0 \/ 0\) *$/ {print}' "$f" | cut -c1-200
done
