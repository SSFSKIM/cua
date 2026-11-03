#!/bin/bash
# Task 50: waits for a guarded step to end; prints a guard flag or an owner change at once, and the end.
# usage: wait-step.sh <step dir> <runner output file>
D=$1; OUT=$2
flagged=0
until [ -e "$D/session.done" ] && grep -q '^exit' "$OUT" 2>/dev/null; do
  if [ $flagged = 0 ] && [ -s "$D/flags.jsonl" ]; then echo "FLAG: $(head -c 400 "$D/flags.jsonl")"; flagged=1; fi
  if [ $flagged = 0 ] && [ -e "$D/owner-changed" ]; then echo "OWNER CHANGE: $(tail -5 "$D/owner-watch.log")"; flagged=1; fi
  sleep 3
done
echo "done: $(tail -3 "$OUT" | tr '\n' ' ')"
