#!/bin/bash
# task 88: this round's live pilots, one after another, each a private pilot step on the pinned engine (pilot.sh), then
# V3's verdict run on a private display (verdict-private.mjs), each under the host lock, capped at 45 minutes.
set -u
D=/Users/new/.local/share/cua-171
P=$D/m5-t4r2
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/agent-a458977939f1feb0d
for step in "$@"; do
  if [ "$step" = V3-private ]; then
    [ -e "$D/hold-sittings" ] && { echo "$(date -u +%FT%TZ) hold-sittings present: V3-private not started" | tee -a "$P/out/pilot.log"; continue; }
    pgrep -x stress-ng > /dev/null && { echo "stress-ng running: V3-private not started" | tee -a "$P/out/pilot.log"; continue; }
    echo "$(date -u +%FT%TZ) start V3-private load=$(cut -d' ' -f1-3 /proc/loadavg) head=$(git -C "$G" rev-parse --short HEAD)" | tee -a "$P/out/pilot.log"
    "$D/locked.sh" m5-t4r2 timeout -s TERM -k 120 45m node "$P/verdict-private.mjs" V3 "$P/home" "$P/out" > "$P/out/V3-private.driver.out" 2>&1
    echo "$(date -u +%FT%TZ) end V3-private exit $? $(tail -1 "$P/out/V3-private.driver.out" | cut -c1-200)" | tee -a "$P/out/pilot.log"
  else
    bash "$P/pilot.sh" "$step"
  fi
done
echo "$(date -u +%FT%TZ) live done: $*" | tee -a "$P/out/pilot.log"
