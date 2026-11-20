#!/bin/bash
# Task 116: waits (at most ~3 h) until either host's chain logs gain an `end` line, then prints both tails.
T=/Users/new/.local/share/cua-171/task116
count() { cat "$T"/x64*/chain.log 2>/dev/null | grep -c " end "; timeout 20 ssh cua-171-arm64 "cat $T/arm64*/chain.log 2>/dev/null | grep -c ' end '"; }
start=$(count | paste -sd+ | bc)
for i in $(seq 1 360); do
  sleep 30
  now=$(count | paste -sd+ | bc)
  [ -n "$now" ] && [ "$now" -gt "$start" ] && break
done
tail -n 3 "$T"/x64*/chain.log
timeout 20 ssh cua-171-arm64 "tail -n 3 $T/arm64*/chain.log; ls /Users/new/.local/share/cua-171/hold-sittings 2>&1"
