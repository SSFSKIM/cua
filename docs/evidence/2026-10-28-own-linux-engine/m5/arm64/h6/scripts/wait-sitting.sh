#!/bin/bash
# Task 122: a bounded wait on the :0 sitting (run-sitting.sh's process) for its controller: returns when zero.log gains a
# line (a step's end, its after-step reading, a stop), when hold-sittings appears, or when the sitting exits, or after
# <seconds>. Read-only.
# usage: wait-sitting.sh <sitting pid> <zero.log> <seconds>
set -u
pid=$1; L=$2; secs=$3
D=/Users/new/.local/share/cua-171
n=$(grep -c "" "$L")
end=$(( $(date +%s) + secs ))
while [ "$(date +%s)" -lt "$end" ]; do
  m=$(grep -c "" "$L")
  [ "$m" -gt "$n" ] && { sed -n "$((n+1)),${m}p" "$L" | cut -c1-300; n=$m; }
  [ -e "$D/hold-sittings" ] && { echo "HOLD-SITTINGS PRESENT"; exit 0; }
  kill -0 "$pid" 2>/dev/null || { echo "sitting exited"; exit 0; }
  sleep 15
done
echo "still running at $(date -u +%FT%TZ)"
