#!/bin/bash
# Task 98: one of this task's own runs stopped before its end: SIGTERM to the run's own launcher (the node process of
# t98-run.mjs whose arguments name the run's out directory), which forwards it to the harness, whose cleanup then
# runs. Only a process whose command line is this task's launcher with that run's directory is signalled, by pid.
# usage: stop-run.sh <run name>
set -u
NAME=$1
DIR=/Users/new/.local/share/cua-171/task98/out/$NAME
found=0
for pid in $(pgrep -u "$(id -u)" -f "task98/bin/t98-run.mjs"); do
  cmd=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null)
  case "$cmd" in
    node\ */task98/bin/t98-run.mjs\ *" $DIR $NAME "*)
      echo "$(date -u +%FT%TZ) SIGTERM to $pid: $(echo "$cmd" | cut -c1-160)"
      kill -TERM "$pid"
      found=1
      ;;
  esac
done
[ "$found" = 1 ] || echo "no launcher of $NAME is running"
