#!/bin/bash
# Task 105 (from task 99's and task 89's precheck-zero.sh): the x64 :0 sitting's preconditions, read just before it:
# hold-sittings, a load running, the owner's Chrome (pid 2546101, read by its own process, never signalled), the host
# lock's last line, the load, :0's pointer, leftovers, task 59's Firefox first on PATH, and google-chrome's version.
set -u
D=/Users/new/.local/share/cua-171
echo "time $(date -u +%FT%TZ)"
[ -e "$D/hold-sittings" ] && echo "hold-sittings: PRESENT" || echo "hold-sittings: absent"
pgrep -x stress-ng > /dev/null && echo "stress-ng: RUNNING" || echo "stress-ng: none"
ps -o pid=,lstart=,comm= -p 2546101 | sed 's/^/owner chrome: /'
echo "load $(cut -d' ' -f1-3 /proc/loadavg)"
echo "lock, last line: $(tail -1 "$D/host-lock.log" | cut -c1-160)"
DISPLAY=:0 XAUTHORITY=$HOME/.Xauthority timeout 5 xdotool getmouselocation | sed 's/^/pointer: /'
echo "/tmp/cua171-run-* present: [$(ls -d /tmp/cua171-run-* 2>/dev/null | tr '\n' ' ')]"
PATH=$D/task59/bin:$PATH command -v firefox | sed 's/^/firefox on PATH (sitting.sh): /'
echo "google-chrome: $(google-chrome --version)"
echo "gate leftovers: $(timeout 120 $D/task105/g.sh leftovers 2>&1 | head -3 | tr "
" " ")"
