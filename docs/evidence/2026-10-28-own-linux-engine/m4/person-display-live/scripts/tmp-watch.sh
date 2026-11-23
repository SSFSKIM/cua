#!/bin/bash
# Task 50: where the run's applications and engines write their temporary files. Every 30 s during a step: the names
# in each run scratch's tmp (<tmproot>/cua171-run-*/tmp and /tmp/cua171-run-*/tmp, the run's own TMPDIR for its
# applications and engines, task 51), two levels deep, and the entries of /tmp itself newer than the step's start that
# are not the step's own tmproot. Names only. Ends when <out>/session.done appears.
# usage: tmp-watch.sh <out> <tmproot> <start marker file>
set -u
out=$1; tmproot=$2; marker=$3
n=0
while [ ! -e "$out/session.done" ]; do
  n=$((n + 1))
  {
    echo "== $(date -u +%FT%T.%3NZ) sample $n"
    for d in "$tmproot"/cua171-run-*/tmp /tmp/cua171-run-*/tmp; do
      [ -d "$d" ] || continue
      echo "run tmp $d:"
      find "$d" -mindepth 1 -maxdepth 2 -printf '  %P\n' 2>/dev/null | sed -E 's/[0-9]{6,}/N/g' | sort | uniq -c
    done
    echo "/tmp entries newer than the start (not the tmproot):"
    find /tmp -mindepth 1 -maxdepth 1 -newer "$marker" ! -path "$tmproot" -printf '  %f\n' 2>/dev/null | sort
  } >> "$out/tmp-watch.log"
  sleep 30
done
