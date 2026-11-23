#!/bin/bash
# Task 99 (T7; the controller's plan change from rulings 827 and 828): the idle driver is stopped after its step in
# flight (D2, started at 11:47:53Z before the change arrived) by its STOP file, then started again on the idle steps
# left with the class-A steps taken out (H1, H2; D2 and S1 are class A too, D2 already ran). They rerun on 0.4.1 at H''''.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task99
OUT=$D/m5/out-arm64
until grep -q 'STOP file present' "$OUT/driver.log"; do sleep 20; done
while pgrep -f "$T/drive.sh" > /dev/null; do sleep 5; done
rm -f "$OUT/STOP"
echo "$(date -u +%FT%TZ) relaunch: class-A steps skipped by ruling 827: S1, H1, H2 (D2 ran before the change)" >> "$OUT/driver.log"
exec "$T/drive.sh" D3 D4 D5 R1 R2 R3 R4 FB E1 S2 S3 S4 F1a F1b F2 ES P1 P2 P3 P4 P6 P5 C1
