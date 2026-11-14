#!/bin/bash
# Task 46 (a): the owner's Chrome and :0, read only. The Chrome main process's pid and start time (ticks since boot),
# and :0's client list read with xprop -root _NET_CLIENT_LIST and each window's WM_CLASS (never a title).
# usage: owner-check.sh <label> <chrome pid>
set -u
label=$1; pid=$2
export DISPLAY=:0 XAUTHORITY=/Users/new/.Xauthority
echo "== $label $(date -u +%FT%T.%3NZ)"
if [ -r /proc/$pid/stat ]; then
  echo "chrome pid $pid alive; starttime_ticks $(awk '{print $22}' /proc/$pid/stat); exe $(readlink /proc/$pid/exe)"
else
  echo "chrome pid $pid GONE"
fi
list=$(timeout 5 xprop -root _NET_CLIENT_LIST 2>&1)
ids=$(echo "$list" | grep -o '0x[0-9a-f]*')
echo "_NET_CLIENT_LIST count $(echo "$ids" | grep -c .)"
for id in $ids; do timeout 5 xprop -id "$id" WM_CLASS 2>&1 | sed 's/^WM_CLASS(STRING) = //'; done | sort | uniq -c
echo "chrome-named processes: $(pgrep -c -x chrome)"
