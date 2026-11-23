#!/bin/bash
# Task 148 (task 135's step.sh): one private step at H9 inside its hold of the host lock, launched as
#   locked.sh h9-x64 timeout -s TERM -k 60 45m step.sh <step>
# It refuses while hold-sittings exists, waits inside the hold up to 6 minutes for a quiet host (no stress-ng, the
# 1-minute load below 1.0; a previous holder's load lags in the average), records the load it starts at, then execs the
# step's line exactly as gate.mjs print gave it (commands.txt) without its leading `locked.sh h9-x64`, which this hold
# already is. The 45-minute timeout outside covers the wait and the step (SIGTERM, which gate.mjs forwards).
# Its own lines start with "step.sh ".
# usage: step.sh <step>
set -u
D=/Users/new/.local/share/cua-171
T=$D/task148
step=$1
LOCKED="$D/locked.sh h9-x64 "
[ -e "$D/hold-sittings" ] && { echo "step.sh hold-sittings present inside the hold: $step not started"; exit 5; }
cmd=$(awk -v s="== $step" '$0 == s {getline; print; exit}' "$T/commands.txt")
[ -n "$cmd" ] || { echo "step.sh no printed command for $step"; exit 2; }
case "$cmd" in "$LOCKED"*) cmd=${cmd#"$LOCKED"} ;; *) echo "step.sh $step's printed command does not start with $LOCKED"; exit 2 ;; esac
start=$(date +%s)
while [ $(( $(date +%s) - start )) -lt 360 ]; do
  if ! pgrep -x stress-ng > /dev/null && awk -v l="$(cut -d' ' -f1 /proc/loadavg)" 'BEGIN{exit !(l < 1.0)}'; then break; fi
  sleep 10
done
s=none; pgrep -x stress-ng > /dev/null && s=RUNNING
echo "step.sh $(date -u +%FT%TZ) start $step after $(( $(date +%s) - start )) s quiet wait: load=$(cut -d' ' -f1-3 /proc/loadavg) stress-ng=$s df=$(df -BG --output=avail / | tail -1 | tr -d ' ')"
echo "step.sh command: $cmd"
eval "exec $cmd"
