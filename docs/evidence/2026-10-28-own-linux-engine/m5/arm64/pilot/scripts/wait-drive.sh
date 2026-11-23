#!/bin/bash
# Task 96: wait (from the x64 host) until the arm64 driver's current run (its log from the latest "driver start") has
# ended <n> steps, or stopped, or finished, up to <seconds>; then print that run's end lines.
# usage: wait-drive.sh <n ends in the current run> [seconds] [log]
N=$1; SECS=${2:-580}
L=${3:-/Users/new/.local/share/cua-171/m5/pilot-arm64/out/driver.log}
cur() { ssh cua-171-arm64 "awk '/driver start/{buf=\"\"} {buf=buf \$0 \"\n\"} END{printf \"%s\", buf}' $L"; }
stop=$(( $(date +%s) + SECS ))
while [ "$(date +%s)" -lt "$stop" ]; do
  c=$(cur)
  ends=$(grep -c ' end ' <<<"$c")
  fin=$(grep -cE 'TIMEOUT|REFUSED|driver done|stopping' <<<"$c")
  { [ "${ends:-0}" -ge "$N" ] || [ "${fin:-0}" -ge 1 ]; } && break
  sleep 60
done
cur | grep -E ' end |TIMEOUT|REFUSED|driver done|stopping' | tail -40
