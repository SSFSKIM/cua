#!/bin/bash
# Task 87: wait (at most $1 seconds) for the driver's next notable line: a step ending with a nonzero exit, a timeout,
# a hold, or the driver's end; then print the step lines since the start of the wait.
L=/Users/new/.local/share/cua-171/m5/pilot-x64/out/driver.log
n=$(wc -l < "$L")
end=$(( $(date +%s) + ${1:-580} ))
while [ "$(date +%s)" -lt "$end" ]; do
  tail -n +$((n + 1)) "$L" | grep -qE "exit [1-9]|TIMEOUT|hold-sittings|driver done" && break
  sleep 15
done
tail -n +$((n + 1)) "$L" | grep -E "end |TIMEOUT|hold|driver done" | cut -c1-200
echo "now $(date -u +%T); last: $(tail -1 "$L" | cut -c1-80)"
