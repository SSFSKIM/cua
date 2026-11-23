#!/bin/bash
# Task 99 (T7 part 2, at H''''; the controller's word after the hold was cleared at 23:36Z: private parts only): the
# block at twice the load (L1-F4, counted, into the H'''' out root), then the 828(c) counter pilot (uncounted:
# --dev --pilot 2 --engine-stats, at the steps' counted idle profile, into m5/pc-arm64) of the class-B idle steps whose
# engines start through engine.mjs. Each through drive-h4.sh, each step its own hold. The pilot starts only when the
# load block's driver finished ("driver done").
set -u
D=/Users/new/.local/share/cua-171
T=$D/task99
[ -e "$D/hold-sittings" ] && { echo "hold-sittings present"; exit 5; }
T7_OUT=$D/m5/out-arm64-h4 "$T/drive-h4.sh" L1 L2a L2b L2c L3a L3b L3c L3d L3e L4a L4b L4c L5 F3a F3b F4
tail -1 "$D/m5/out-arm64-h4/driver.log" | grep -q 'driver done' || { echo "the load block's driver did not finish: the pilot not started"; exit 3; }
T7_OUT=$D/m5/pc-arm64 STEP_FLAGS="--dev --pilot 2 --engine-stats" "$T/drive-h4.sh" D1 D3 D4 D5 E1 P4 P6 P5 C1
