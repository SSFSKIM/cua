#!/bin/bash
# Task 49: during a session, every 10 s, the owner's Chrome (pid and start time as found before) and :0's client list
# count and WM_CLASS set (never a title), read only. A change stops the session's current harness run (SIGTERM to the
# pid in <out>/driver.pid, the harness's own stop) and is logged. Runs outside the guarded tree (its own :0 reads would
# otherwise count as a run process on :0). Ends when <out>/session.done appears.
# usage: owner-watch.sh <out> <owner pid> <owner start ticks> <:0 window count> <:0 WM_CLASS digest>
set -u
out=$1; pid=$2; start=$3; count=$4; digest=$5
H=/Users/new
log="$out/owner-watch.log"
n=0
while [ ! -e "$out/session.done" ]; do
  now_start=$(awk '{print $22}' /proc/$pid/stat 2>/dev/null || echo gone)
  ids=$(DISPLAY=:0 XAUTHORITY=$H/.Xauthority timeout 5 xprop -root _NET_CLIENT_LIST 2>&1 | grep -o '0x[0-9a-f]*')
  now_count=$(echo "$ids" | grep -c .)
  now_digest=$(for id in $ids; do DISPLAY=:0 XAUTHORITY=$H/.Xauthority timeout 5 xprop -id "$id" WM_CLASS 2>&1; done | sort | md5sum | cut -c1-12)
  n=$((n + 1))
  if [ "$now_start" != "$start" ] || [ "$now_count" != "$count" ] || [ "$now_digest" != "$digest" ]; then
    echo "$(date -u +%FT%T.%3NZ) CHANGE start=$now_start count=$now_count digest=$now_digest" >> "$log"
    [ -r "$out/driver.pid" ] && kill -TERM "$(cat "$out/driver.pid")" 2>/dev/null && echo "$(date -u +%FT%T.%3NZ) stop sent to $(cat "$out/driver.pid")" >> "$log"
    touch "$out/owner-changed"
  fi
  [ $((n % 30)) -eq 1 ] && echo "$(date -u +%FT%T.%3NZ) check $n start=$now_start count=$now_count digest=$now_digest" >> "$log"
  sleep 10
done
echo "$(date -u +%FT%T.%3NZ) done after $n checks, last start=$now_start count=$now_count digest=$now_digest" >> "$log"
