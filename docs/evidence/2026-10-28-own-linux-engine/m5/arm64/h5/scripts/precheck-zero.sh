#!/bin/bash
# Task 109 (from task 99's precheck-zero-h4.sh, on the H5 checkout): a :0 sitting's preconditions, read just before it:
# hold-sittings, a load running, the owner-side Chrome (owner-check.sh's own rule), the host lock's last line, the load,
# :0's pointer, leftovers, Firefox and Chrome on PATH (the PATH chain as the sitting gets it), and the run's Node.
# CHROME_BIN, when set, is the directory put first on PATH for google-chrome (F2's Chrome 158).
set -u
D=/Users/new/.local/share/cua-171
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t109-h5
P=$D/task59/bin:$D/node24/bin:$PATH
[ -n "${CHROME_BIN:-}" ] && P=$CHROME_BIN:$P
echo "time $(date -u +%FT%TZ)"
[ -e "$D/hold-sittings" ] && echo "hold-sittings: PRESENT" || echo "hold-sittings: absent"
pgrep -x stress-ng > /dev/null && echo "stress-ng: RUNNING" || echo "stress-ng: none"
bash "$G/docs/evidence/2026-10-28-own-linux-engine/m4/person-display-live/scripts/owner-check.sh" pre 2>&1 | grep -E '^owner chrome|_NET_CLIENT_LIST count|^:0 client' | sed 's/^/owner-check: /'
echo "load $(cut -d' ' -f1-3 /proc/loadavg)"
echo "lock, last line: $(tail -1 "$D/host-lock.log" | cut -c1-160)"
DISPLAY=:0 XAUTHORITY=$HOME/.Xauthority timeout 5 xdotool getmouselocation | sed 's/^/pointer: /'
echo "/tmp/cua171-run-* present: [$(ls -d /tmp/cua171-run-* 2>/dev/null | tr '\n' ' ')]"
echo "PATH (the sitting's, first 4): $(echo "$P" | cut -d: -f1-4)"
PATH=$P command -v firefox | sed 's/^/firefox on PATH: /'
c=$(PATH=$P command -v google-chrome); echo "google-chrome on PATH: $c -> $(readlink -f "$c")"
grep -m1 -E '^exec ' "$c" | cut -c1-200 | sed 's/^/  its exec: /'
echo "google-chrome --version: $(PATH=$P google-chrome --version)"
echo "node: $(PATH=$P command -v node) $(PATH=$P node --version)"
echo "gate leftovers: $(timeout 120 "$D/task109/g5.sh" leftovers 2>&1 | head -3 | tr "\n" " ")"
