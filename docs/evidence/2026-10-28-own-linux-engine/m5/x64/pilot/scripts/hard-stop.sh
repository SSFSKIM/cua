#!/bin/bash
# Task 87: V3's pilot's hard stop at 45 minutes (05:25:25Z): SIGTERM to the harness process of this run alone (its pid
# and run name checked), so its own stop handler closes its windows and run71.sh's after-checks and pointer restore run.
# usage: hard-stop.sh <harness pid> <deadline, ISO UTC>
set -u
pid=$1
t=$(date -u -d "$2" +%s)
while [ "$(date +%s)" -lt "$t" ]; do
  grep -q "end V3 exit" /Users/new/.local/share/cua-171/task87/x64/zero-V3.out && { echo "ended before the hard stop"; exit 0; }
  sleep 10
done
if kill -0 "$pid" 2>/dev/null && tr '\0' ' ' < "/proc/$pid/cmdline" | grep -q "m4-dev-V3-pilot"; then
  kill -TERM "$pid"
  echo "$(date -u +%FT%TZ) hard stop: SIGTERM to the harness $pid" | tee -a /Users/new/.local/share/cua-171/m5/pilot-x64/out/zero.log
fi
