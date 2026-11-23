#!/bin/bash
# Task 116's x64 plan after fix wave 2's news (the controller, 2026-11-20): fdaff715's runs stand for the release timing
# with the sampler on and off, the watch and the cost; its ping data is a pilot only. So, after the running V5 chain
# (v5n-2-1..4 on fdaff715, given as a pid to wait for):
# - on fdaff715 (x64/): D1's plain cells at twice the load with the sampler-off lane (one run), V5 idle with it (two runs
#   of 15 blocks), the idle cost cells (D1 with the sampler-off lane, D2);
# - on the wave-2 head (x64-w2/, its binary linked as bin/wave2-x64 when built): the predictor's runs, V5 at twice the
#   load (2 runs of 26 blocks, the default lane), D1's plain cells and D2 at twice the load (2 runs each, the default lane).
# usage: x64-plan2.sh <fdaff715 engine> <pid to wait for>
set -u
T=/Users/new/.local/share/cua-171/task116
S=$T/scripts
C=$1
while kill -0 "$2" 2>/dev/null; do sleep 20; done
export OFF_FLAG="--drag-dnd-hold-ping off"
OPS=select,range,scroller,canvas "$S/x64-chain.sh" "$C" d1n-2-1
BLOCKS=15 "$S/x64-chain.sh" "$C" v5n-0-1 v5n-0-2
"$S/x64-chain.sh" "$C" d1n-0-1 d2-0-1
echo "$(date -u +%FT%TZ) fdaff715 part done; waiting for $T/bin/wave2-x64" >> "$T/x64/chain.log"
until [ -x "$T/bin/wave2-x64" ]; do sleep 60; done
W2=$(readlink -f "$T/bin/wave2-x64")
export OUTDIR=$T/x64-w2
BLOCKS=26 "$S/x64-chain.sh" "$W2" v5-2-1 v5-2-2
OPS=select,range,scroller,canvas "$S/x64-chain.sh" "$W2" d1-2-1 d1-2-2
"$S/x64-chain.sh" "$W2" d2-2-1 d2-2-2
