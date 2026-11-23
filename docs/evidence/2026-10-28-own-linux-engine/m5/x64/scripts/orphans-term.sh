#!/bin/bash
# Task 89 (the controller's word): item 9's first attempt left its private Xvfb and openbox on display :1 (its
# private-desktop.mjs died on the spawn ENOENT). Each pid is signalled only while it is still that program: the same
# start time (stat field 22) and executable as recorded at 23:58Z (orphans-before.txt), and tied to :1 (the Xvfb holds
# the @/tmp/.X11-unix/X1 socket; openbox's environment names DISPLAY=:1; neither's cmdline names a display). TERM, then
# a check that each has ended.
set -u
check() {  # <pid> <start> <exe>
  local p=$1 st ex
  st=$(awk '{print $22}' /proc/$p/stat 2>/dev/null) || { echo "$p: gone already"; return 1; }
  ex=$(readlink /proc/$p/exe 2>/dev/null)
  echo "$p: start $st (recorded $2), exe $ex (recorded $3)"
  [ "$st" = "$2" ] && [ "$ex" = "$3" ]
}
ok=1
if check 3297578 167255552 /usr/bin/Xvfb; then
  inode=$(for f in /proc/3297578/fd/*; do readlink "$f"; done 2>/dev/null | sed -n 's/^socket:\[\([0-9]*\)\]$/\1/p' | while read i; do grep -E " $i @/tmp/.X11-unix/X1$" /proc/net/unix; done | head -1)
  [ -n "$inode" ] && echo "3297578 holds @/tmp/.X11-unix/X1: $inode" || { echo "3297578 does not hold X1: not signalled"; ok=0; }
else ok=0; fi
if check 3297624 167255565 /usr/bin/openbox; then
  d=$(tr '\0' '\n' < /proc/3297624/environ | sed -n 's/^DISPLAY=//p')
  [ "$d" = ":1" ] && echo "3297624 DISPLAY=$d" || { echo "3297624 DISPLAY=$d, not :1: not signalled"; ok=0; }
else ok=0; fi
[ "$ok" = 1 ] || { echo "a check failed: nothing signalled"; exit 1; }
kill -TERM 3297624 3297578
for i in $(seq 1 20); do [ -e /proc/3297624 ] || [ -e /proc/3297578 ] || break; sleep 0.5; done
for p in 3297624 3297578; do [ -e /proc/$p ] && echo "$p still running after TERM" || echo "$p ended"; done
ls -la /tmp/.X11-unix/X1 2>&1 | sed 's/^/X1 socket after: /'
