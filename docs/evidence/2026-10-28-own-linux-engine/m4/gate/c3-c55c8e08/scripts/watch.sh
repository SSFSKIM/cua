#!/bin/bash
# Task 79: waits until the driver log gains a new line that ends a step with a nonzero exit, or says "driver done"; prints it.
# Bounded: gives up after the given minutes (default 120). usage: watch.sh <driver.log> [minutes]
set -u
LOG=$1; MAX=${2:-120}
start=$(wc -l < "$LOG")
for i in $(seq 1 $((MAX * 6))); do
  new=$(tail -n +$((start + 1)) "$LOG")
  hit=$(grep -E " end \S+ exit [1-9]| driver done|STOP file" <<<"$new" | head -1)
  [ -n "$hit" ] && { echo "$new"; exit 0; }
  sleep 10
done
echo "watch timed out after $MAX min"; tail -3 "$LOG"; exit 1
