#!/bin/bash
# Task 96 (the controller's word, after L4a's pilot showed a false ok in the shipped handle lane): L4a's rate on arm64, as
# development runs on the pinned engine: L4a at twice the load with --pilot 100, which caps no cell of its plan
# (t17-fix3, 560 drags), so its whole series runs in the pilot form; then H1, the same plan at idle, as the control.
# Each in its own out root (m5/pa/l4, m5/pa/h1), through drive.sh (its own locked hold, its checks before the step).
set -u
T=/Users/new/.local/share/cua-171/task96
M=/Users/new/.local/share/cua-171/m5/pa
PILOT_N=100 PILOT_OUT=$M/l4 "$T/drive.sh" L4a
PILOT_N=100 PILOT_OUT=$M/h1 "$T/drive.sh" H1
echo "l4a-rate done $(date -u +%FT%TZ)"
