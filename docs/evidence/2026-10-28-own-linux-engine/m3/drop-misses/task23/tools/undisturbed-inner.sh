#!/bin/bash
# Inside the private display and session bus: Openbox, the AT-SPI bus, then task 20's track.mjs with the pointer parked
# inside Chrome (the undisturbed set): <out.jsonl> <trials>, two lanes, shared and dedicated.
set -u
T=/Users/new/.local/share/cua-171/task23
TOOLS=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m3/drop-misses/task20-build/tools
export PATH=$T/bin:$PATH
echo "display $DISPLAY"
openbox > "$T/runs/openbox.log" 2>&1 &
/usr/libexec/at-spi-bus-launcher --launch-immediately > "$T/runs/atspi.log" 2>&1 &
for _ in $(seq 1 75); do
  xprop -root AT_SPI_BUS 2>/dev/null | grep -q '"' && break
  sleep 0.2
done
xprop -root AT_SPI_BUS
cd /Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171 || exit 1
PARKS=inside node "$TOOLS/track.mjs" "$1" "$2" cua= "ded=--desktop dedicated"
code=$?
pkill -f "user-data-dir=$T/chrome-profile"
exit $code
