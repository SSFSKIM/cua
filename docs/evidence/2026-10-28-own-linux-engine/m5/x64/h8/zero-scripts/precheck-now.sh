#!/bin/bash
# x64 V5 at H8, preparation (the coordinator's item 3): the preconditions that can be read now without :0, read-only:
# the owner's Chrome by ps only (never signalled), google-chrome on PATH and its version, task 59's Firefox first on
# PATH as sitting.sh puts it and its version (no display: DISPLAY and WAYLAND_DISPLAY unset), hold-sittings, stress-ng,
# the load, the host lock's last line, /tmp/cua171-run-*, and the free disk (ruling 937). :0's pointer and the gate's
# leftovers are read only in the sitting's own precheck, after the GO.
set -u
D=/Users/new/.local/share/cua-171
echo "time $(date -u +%FT%TZ)"
if [ -e "$D/hold-sittings" ]; then echo "hold-sittings: PRESENT"; else echo "hold-sittings: absent"; fi
if pgrep -x stress-ng > /dev/null; then echo "stress-ng: RUNNING"; else echo "stress-ng: none"; fi
ps -o pid=,user=,lstart=,comm= -p 2546101 | sed 's/^/owner chrome (expected pid 2546101): /'
echo "the oldest chrome process by ps: $(ps -C chrome -o pid=,lstart= --sort=start_time | head -1)"
echo "load $(cut -d' ' -f1-3 /proc/loadavg)"
echo "lock, last line: $(tail -1 "$D/host-lock.log" | cut -c1-160)"
echo "/tmp/cua171-run-* present: [$(ls -d /tmp/cua171-run-* 2>/dev/null | tr '\n' ' ')]"
echo "google-chrome on PATH: $(command -v google-chrome) -> $(google-chrome --version)"
ff=$(PATH=$D/task59/bin:$PATH command -v firefox)
echo "firefox on PATH (sitting.sh): $ff -> $(env -u DISPLAY -u WAYLAND_DISPLAY "$ff" --version 2>&1 | head -1)"
echo "df /: $(df -h --output=avail / | tail -1 | tr -d ' ') free"
