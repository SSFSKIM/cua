#!/bin/bash
# Task 99 (T7 part 2, at H'''': the H'''' checkout and its gate; from precheck-zero.sh, from task 96's and task 89's): the arm64 :0 sitting's preconditions, read just before it: hold-sittings,
# a load running, the owner-side Chrome (owner-check.sh's own rule), the host lock's last line, the load, :0's pointer,
# leftovers, Firefox and Chrome on PATH, and the run's Node.
set -u
D=/Users/new/.local/share/cua-171
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t7-h4
echo "time $(date -u +%FT%TZ)"
[ -e "$D/hold-sittings" ] && echo "hold-sittings: PRESENT" || echo "hold-sittings: absent"
pgrep -x stress-ng > /dev/null && echo "stress-ng: RUNNING" || echo "stress-ng: none"
bash "$G/docs/evidence/2026-10-28-own-linux-engine/m4/person-display-live/scripts/owner-check.sh" pre 2>&1 | grep -E '^owner chrome|_NET_CLIENT_LIST count|^:0 client' | sed 's/^/owner-check: /'
echo "load $(cut -d' ' -f1-3 /proc/loadavg)"
echo "lock, last line: $(tail -1 "$D/host-lock.log" | cut -c1-160)"
DISPLAY=:0 XAUTHORITY=$HOME/.Xauthority timeout 5 xdotool getmouselocation | sed 's/^/pointer: /'
echo "/tmp/cua171-run-* present: [$(ls -d /tmp/cua171-run-* 2>/dev/null | tr '\n' ' ')]"
PATH=$D/task59/bin:$PATH command -v firefox | sed 's/^/firefox on PATH (sitting.sh): /'
echo "google-chrome: $(google-chrome --version)"
echo "node (sitting.sh): $(PATH=$D/node24/bin:$PATH command -v node) $(PATH=$D/node24/bin:$PATH node --version)"
echo "gate leftovers: $(timeout 120 $D/task99/g4.sh leftovers 2>&1 | head -3 | tr "
" " ")"
