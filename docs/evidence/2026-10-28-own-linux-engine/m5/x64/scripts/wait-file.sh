#!/bin/bash
# Task 89 (from task 87's wait-event.sh): wait at most $2 seconds (default 580) for log $1 to gain a line matching
# $3 (an extended regex; default: a nonzero exit, a timeout, a refusal, a hold, or an end of the run); then print the
# lines it gained that match $4 (default: the same as $3 plus step ends), cut to 220 characters.
L=$1
n=$(wc -l < "$L" 2>/dev/null || echo 0)
end=$(( $(date +%s) + ${2:-580} ))
pat=${3:-"exit [1-9]|TIMEOUT|REFUSED|hold-sittings|driver done|proof done|sitting done|stopped"}
show=${4:-"end |$pat"}
while [ "$(date +%s)" -lt "$end" ]; do
  tail -n +$((n + 1)) "$L" 2>/dev/null | grep -qE "$pat" && break
  sleep 15
done
tail -n +$((n + 1)) "$L" 2>/dev/null | grep -E "$show" | cut -c1-220
echo "now $(date -u +%T); last: $(tail -1 "$L" 2>/dev/null | cut -c1-120)"
