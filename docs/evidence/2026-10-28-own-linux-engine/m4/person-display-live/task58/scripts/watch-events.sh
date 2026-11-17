#!/bin/bash
# Task 58: prints a line on any guard flag, owner change or watchdog stall of a step, and once when the step is done.
# usage: watch-events.sh <step dir>
d=$1; seen=0
while [ ! -e "$d/session.done" ]; do
  if [ -e "$d/flags.jsonl" ] && [ $seen = 0 ]; then echo "FLAG: $(head -c 400 "$d/flags.jsonl")"; seen=1; fi
  if [ -e "$d/owner-changed" ]; then echo "OWNER CHANGED: $(tail -3 "$d/owner-watch.log" | tr '\n' ' ')"; exit 0; fi
  if grep -q '"stall"\|"lost"' "$d/run/watchdog.jsonl" 2>/dev/null; then echo "WATCHDOG STALL"; exit 0; fi
  sleep 2
done
echo "session done"
