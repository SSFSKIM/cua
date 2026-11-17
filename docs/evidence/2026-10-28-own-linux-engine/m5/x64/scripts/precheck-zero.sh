#!/bin/bash
# Task 89 (from task 87): the :0 sitting's preconditions, read just before the step: hold-sittings, a load running, the owner's Chrome,
# the host lock's last lines, the load, :0's pointer, and whether task 59's Firefox is first on PATH.
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
PATH=$D/task59/bin:$PATH command -v firefox | sed 's/^/firefox on PATH (run-zero.sh): /'
echo "google-chrome: $(google-chrome --version)"
echo "gate leftovers: $(timeout 120 /Users/new/.local/share/cua-171/task89/g.sh leftovers 2>&1 | head -3 | tr "
" " ")"
