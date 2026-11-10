#!/bin/bash
# Task 71: T19's manifest (`--experiment predicates`) on the person's display, one half per call so each holds the host
# lock under an hour, under task 50's guards through run71.sh (`WRAP` names the wrapper, wrap71.py on the design
# session's word), only after the design session's "GO :0". Run it under the host lock.
# usage: manifest0.sh <harness dir> <candidate engine path> <name> a|b
set -u
d=$(cd "$(dirname "$0")" && pwd)
. "$d/env.sh"
guard
h=$1
cand=$2
name=$3
half=$4
case "$half" in
  a) ops=click,scroll ;;
  b) ops=move,select ;;
  *) echo "a or b" >&2; exit 2 ;;
esac
for _ in $(seq 60); do
  awk '{exit !($1 <= 1.0)}' /proc/loadavg && break
  sleep 5
done
"$cand" --version
sha256sum "$cand"
echo "start $name-$half $(date -u +%FT%TZ) loadavg $(cut -d' ' -f1-3 /proc/loadavg)"
"$d/run71.sh" "$T/runs/$name-$half" "$h" --experiment predicates --ops "$ops" --vendor "$PINNED" --cua "$cand" --run "t71-$name-$half"
status=$?
echo "end $name-$half $(date -u +%FT%TZ) loadavg $(cut -d' ' -f1-3 /proc/loadavg) status $status"
exit $status
