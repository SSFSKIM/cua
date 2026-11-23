#!/bin/bash
# x64 V5 at H8 (task 123's precheck-zero.sh): the :0 sitting's preconditions, read just before it, after the GO only (it
# reads :0's pointer): hold-sittings, a load running, the owner's Chrome (read by ps, never signalled), the host lock's
# last line, the load, :0's pointer, leftovers, task 59's Firefox first on PATH and its version, google-chrome's
# version, and the free disk (ruling 937).
set -u
D=/Users/new/.local/share/cua-171
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/t129-x64
echo "time $(date -u +%FT%TZ)"
if [ -e "$D/hold-sittings" ]; then echo "hold-sittings: PRESENT"; else echo "hold-sittings: absent"; fi
if pgrep -x stress-ng > /dev/null; then echo "stress-ng: RUNNING"; else echo "stress-ng: none"; fi
ps -o pid=,lstart=,comm= -p 2546101 | sed 's/^/owner chrome: /'
echo "load $(cut -d' ' -f1-3 /proc/loadavg)"
echo "lock, last line: $(tail -1 "$D/host-lock.log" | cut -c1-160)"
DISPLAY=:0 XAUTHORITY=$HOME/.Xauthority timeout 5 xdotool getmouselocation | sed 's/^/pointer: /'
echo "/tmp/cua171-run-* present: [$(ls -d /tmp/cua171-run-* 2>/dev/null | tr '\n' ' ')]"
ff=$(PATH=$D/task59/bin:$PATH command -v firefox)
echo "firefox on PATH (sitting.sh): $ff"
echo "firefox version: $(env -u DISPLAY -u WAYLAND_DISPLAY "$ff" --version 2>&1 | head -1)"
echo "google-chrome: $(google-chrome --version)"
echo "df /: $(df -h --output=avail / | tail -1 | tr -d ' ') free"
echo "gate leftovers: $(timeout 120 node "$G/scripts/linux-engine-gate/gate.mjs" leftovers 2>&1 | head -3 | tr '\n' ' ')"
