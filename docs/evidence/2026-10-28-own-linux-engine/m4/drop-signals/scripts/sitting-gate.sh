#!/bin/bash
# Task 68's sitting at the gate's window load: the main plan with the gate's other Chrome windows open (dnd.mjs
# GATE_BALLAST) and the gate-sequence cells (a fresh engine a drag, after the gate's preceding dedicated drop).
set -u
d=$(dirname "$0")
H=$HOME/.local/share/cua-171/task68/harness-405aa773
E=$HOME/.local/share/cua-171/task68/build/405aa773/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
"$d/ds.sh" "$H" gate-main "$E" --plan main --ballast gate
