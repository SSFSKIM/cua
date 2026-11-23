#!/bin/bash
# Task 99 (T7 part 2, at H''''): the block at twice the load, L1-F4 in the gate's order, started by drive-h4.sh into the
# H'''' out root once the :0 sitting has ended with "sitting done" and no hold-sittings. If the sitting ends any other
# way, nothing starts and the controller is told.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task99
OUT=$D/m5/out-arm64-h4
# the sitting has ended when its launcher (sitting.sh, under the sitting's lock hold) is no longer running
while pgrep -f "task99/sitting.sh" > /dev/null; do sleep 30; done
sleep 5
if grep -q 'sitting done' "$OUT/zero.log" && [ ! -e "$D/hold-sittings" ]; then
  echo "$(date -u +%FT%TZ) the sitting is done and clear: the twice-load block starts" >> "$OUT/driver.log"
  exec "$T/drive-h4.sh" L1 L2a L2b L2c L3a L3b L3c L3d L3e L4a L4b L4c L5 F3a F3b F4
fi
echo "$(date -u +%FT%TZ) the sitting did not end done and clear: the twice-load block not started" >> "$OUT/driver.log"
exit 3
