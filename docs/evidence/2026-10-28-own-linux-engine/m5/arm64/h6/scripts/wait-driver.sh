#!/bin/bash
# Task 122: a bounded wait on a driver (drive.sh) for its controller: returns when the driver logs a step end, a stop,
# or exits, or after <seconds>, printing what it logged. Read-only.
# usage: wait-driver.sh <driver pid> <driver.log> <seconds>
set -u
pid=$1; L=$2; secs=$3
n=$(grep -c "" "$L")
end=$(( $(date +%s) + secs ))
while [ "$(date +%s)" -lt "$end" ]; do
  m=$(grep -c "" "$L")
  if [ "$m" -gt "$n" ] && sed -n "$((n+1)),${m}p" "$L" | grep -qE "Z (end|FAILED|REFUSED|STOP|TIMEOUT|disk|driver done|hold-sittings)"; then
    sed -n "$((n+1)),${m}p" "$L" | grep -E "Z (end|FAILED|REFUSED|STOP|TIMEOUT|disk|driver|hold-sittings|wait)" | cut -c1-260
    kill -0 "$pid" 2>/dev/null || echo "driver exited"
    exit 0
  fi
  kill -0 "$pid" 2>/dev/null || { echo "driver exited"; tail -3 "$L" | cut -c1-260; exit 0; }
  sleep 20
done
echo "still running at $(date -u +%FT%TZ): $(tail -1 "$L" | cut -c1-160)"
