#!/bin/bash
# Task 99 (from task 96's): wait (from the x64 host) until the arm64 driver's current run (its log from the latest
# "driver start") has ended <n> steps, or a step exited nonzero, or it stopped or finished, up to <seconds>; polls every
# 10 minutes; then prints that run's end lines.
# usage: wait-drive.sh <n ends in the current run> [seconds] [log]
N=$1; SECS=${2:-14400}
L=${3:-/Users/new/.local/share/cua-171/m5/out-arm64/driver.log}
cur() { ssh -o ConnectTimeout=20 cua-171-arm64 "awk '/driver start/{buf=\"\"} {buf=buf \$0 \"\n\"} END{printf \"%s\", buf}' $L"; }
stop=$(( $(date +%s) + SECS ))
while [ "$(date +%s)" -lt "$stop" ]; do
  c=$(cur)
  ends=$(grep -cE '^[0-9].* end ' <<<"$c")
  bad=$(grep -cE '^[0-9].* end [A-Za-z0-9]+ exit [1-9]' <<<"$c")
  fin=$(grep -cE 'TIMEOUT|REFUSED|driver done|stopping|stopped' <<<"$c")
  { [ "${ends:-0}" -ge "$N" ] || [ "${bad:-0}" -ge 1 ] || [ "${fin:-0}" -ge 1 ]; } && break
  sleep 600
done
cur | grep -E '^[0-9].* end |TIMEOUT|REFUSED|driver done|stopping|stopped' | cut -c1-260 | tail -40
