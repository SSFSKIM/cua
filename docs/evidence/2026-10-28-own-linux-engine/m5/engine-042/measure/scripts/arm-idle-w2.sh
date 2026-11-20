#!/bin/bash
# Task 116 on arm64: the adaptive-hold questions at idle on wave 2, after the sel control at 2x: V5's two cells on :0
# through the sitting launcher (15 blocks; arm's late renderer at idle showed only on :0), then on a private display
# V5's two cells (15 blocks), the scene's select control (15 blocks) and D1's plain cells, the default lane.
T=/Users/new/.local/share/cua-171/task116
# the sel chain, by its pid (arm-sel.sh execs arm-chain.sh, so its own name is gone)
while kill -0 "${1:?the sel chain pid}" 2>/dev/null; do sleep 30; done
C=$(readlink -f "$T/bin/wave2-arm64")
OUTDIR=$T/arm64-w2 ZBLOCKS=15 "$T/scripts/arm-chain.sh" "$C" zero || exit $?
OUTDIR=$T/arm64-w2 BLOCKS=15 "$T/scripts/arm-chain.sh" "$C" v5-0-1 sel-0-1
OUTDIR=$T/arm64-w2 OPS=select,range,scroller,canvas "$T/scripts/arm-chain.sh" "$C" d1-0-1
