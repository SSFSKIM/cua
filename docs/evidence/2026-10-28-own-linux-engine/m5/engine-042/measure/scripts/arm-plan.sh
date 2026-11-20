#!/bin/bash
# Task 116's arm64 plan (after fix wave 2's news, the controller, 2026-11-20): first on fdaff715 (arm64/), the runs whose
# numbers don't hang on the ping data: V5 idle on :0 through the sitting launcher (30 blocks), then the idle cost cells
# (D1, D2). Then, on the wave-2 head (arm64-w2/, its binary linked as bin/wave2-arm64 when built), the decisive 2x block
# on private displays: V5's two cells with the sampler-off lane (2 runs of 12 blocks), then the default lane alone (2 runs
# of 25 blocks: 74 blocks, about 220 in-front samples on the default lane in all); D1's plain cells with the sampler-off
# lane and D2 (2 runs each).
# usage: arm-plan.sh <fdaff715 engine>
set -u
T=/Users/new/.local/share/cua-171/task116
S=$T/scripts
C=$1
"$S/arm-chain.sh" "$C" zero || exit $?
"$S/arm-chain.sh" "$C" d1-0-1 d2-0-1
echo "$(date -u +%FT%TZ) fdaff715 part done; waiting for $T/bin/wave2-arm64" >> "$T/arm64/chain.log"
until [ -x "$T/bin/wave2-arm64" ]; do sleep 60; done
W2=$(readlink -f "$T/bin/wave2-arm64")
export OUTDIR=$T/arm64-w2 OFF_FLAG="--drag-dnd-hold-ping off"
BLOCKS=12 "$S/arm-chain.sh" "$W2" v5n-2-1 v5n-2-2
BLOCKS=25 "$S/arm-chain.sh" "$W2" v5-2-1 v5-2-2
OPS=select,range,scroller,canvas "$S/arm-chain.sh" "$W2" d1n-2-1 d1n-2-2
"$S/arm-chain.sh" "$W2" d2-2-1 d2-2-2
