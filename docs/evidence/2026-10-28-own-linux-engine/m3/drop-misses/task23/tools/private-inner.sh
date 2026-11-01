#!/bin/bash
# Inside a private display and session bus: Openbox, the AT-SPI bus, then the command given, from the worktree, with
# the private Chrome first on PATH; that Chrome is ended afterwards.
set -u
T=/Users/new/.local/share/cua-171/task23
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
"$@"
code=$?
pkill -f "user-data-dir=$T/chrome-profile"
exit $code
