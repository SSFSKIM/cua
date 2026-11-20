#!/bin/bash
# Task 118: the process record of which Chrome ran (as T7 proved it from wrap71's process records; here on private
# displays, where no wrap71 runs): every 2 s while <pid> lives, each `chrome` process of this user seen for the first
# time, as <utc> <pid> <exe> <harness>, harness 1 when its command line names a harness run's scratch (cua171-run-).
# No command line is written. Started and ended by the chain (its own process).
# usage: procrec.sh <pid to outlive> <out file>
set -u
watch=$1; out=$2
declare -A seen
while kill -0 "$watch" 2>/dev/null; do
  for p in $(pgrep -u "$(id -u)" -x chrome); do
    [ -n "${seen[$p]:-}" ] && continue
    exe=$(readlink "/proc/$p/exe" 2>/dev/null) || exe=unreadable
    h=0; tr '\0' ' ' < "/proc/$p/cmdline" 2>/dev/null | grep -q 'cua171-run-' && h=1
    seen[$p]=1
    echo "$(date -u +%FT%TZ) $p $exe $h" >> "$out"
  done
  sleep 2
done
