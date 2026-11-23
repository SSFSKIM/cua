#!/bin/bash
# Task 96: a short digest of each pilot step's record (read only): exit, unjudged count, end, and the harness summary's
# verdict and miss lines. usage: digest.sh <out root> <step>...
OUT=$1; shift
for s in "$@"; do
  d=$(ls -d "$OUT/$s".development-run.pinned.pilot 2>/dev/null | head -1)
  [ -n "$d" ] || { echo "### $s: no record"; continue; }
  echo "### $s: $(grep -m1 -oE 'exit [0-9]+' "$d/README.md") | $(grep -m1 -E '^- unjudged' "$d/README.md" | cut -c3-90) | $(grep -m1 -E '^- end:' "$d/README.md" | cut -c3-120)"
  f=$d/run/summary.md
  [ -f "$f" ] && grep -E "^(Cells where|The judges' verdict|VERDICT|FAIL|.*\*\*FAIL|.*false ok|.*refused|.*ended its|.*restarted|Run valid|run valid|.*no verdict FAIL|.*verdict)" "$f" | grep -v '^|' | cut -c1-400 | head -12
  grep -hE 'FAIL|Error|error:' "$d/stderr.log" 2>/dev/null | head -3 | cut -c1-300
done
