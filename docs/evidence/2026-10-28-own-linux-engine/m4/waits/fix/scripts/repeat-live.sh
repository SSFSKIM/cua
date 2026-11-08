#!/bin/bash
# Runs one live library test N times under its own xvfb-run each time (flakiness check).
# usage: repeat-live.sh <n> <filter> [engine source dir|-]
set -u
n=$1
filter=$2
src=${3:--}
pass=0
for i in $(seq 1 "$n"); do
  if <task64-fix>/scripts/lib-live.sh "$src" "$filter" > /tmp/repeat-live-$$.txt 2>&1; then
    pass=$((pass + 1))
  else
    grep -E 'panicked|assertion|left|right' /tmp/repeat-live-$$.txt | head -5
  fi
done
rm -f /tmp/repeat-live-$$.txt
echo "$pass of $n passed"
