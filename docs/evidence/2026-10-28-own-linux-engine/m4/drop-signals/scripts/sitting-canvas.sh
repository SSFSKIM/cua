#!/bin/bash
# Task 68's fix wave: the canvas rule's taking control, 30 drags from a draggable canvas at idle, on the harness of
# 0dfaab84 (export-harness.sh) and the musl build of 405aa773, the engine every counted run used (the control's lane is
# the shipped one, which the fix wave's accept change does not touch).
# usage: sitting-canvas.sh [run name]   (default idle-canvas)
set -u
d=$(dirname "$0")
export T=${T:-$HOME/.local/share/cua-171/task68fix}
H=$T/harness-0dfaab84
E=$HOME/.local/share/cua-171/task68/build/405aa773/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
# idle: the 1-minute load average settled under 1.0 after whatever ran before (up to 10 minutes)
for _ in $(seq 120); do
  awk '{ exit !($1 < 1.0) }' /proc/loadavg && break
  sleep 5
done
"$d/ds.sh" "$H" "${1:-idle-canvas}" "$E" --plan canvas-drag
