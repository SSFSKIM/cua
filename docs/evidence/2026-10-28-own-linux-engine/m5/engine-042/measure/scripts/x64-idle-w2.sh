#!/bin/bash
# Task 116: the adaptive-hold questions at idle on wave 2 (fdaff715's pings are a pilot only): after the sel control,
# V5's two cells idle (15 blocks), the scene's select control idle (15 blocks) and D1's plain cells idle, on a private
# display, the default lane (D1 idle runs pinned, newest and cua).
# usage: x64-idle-w2.sh <the sel script pid>   (arm64 uses arm-idle-w2.sh, which adds the :0 sitting)
T=/Users/new/.local/share/cua-171/task116
if [ -n "${ARM:-}" ]; then chain=$T/scripts/arm-chain.sh; out=$T/arm64-w2; wait="scripts/arm-sel.sh"; b=$T/bin/wave2-arm64
else chain=$T/scripts/x64-chain.sh; out=$T/x64-w2; wait="scripts/x64-sel.sh|scripts/x64-plan2.sh"; b=$T/bin/wave2-x64; fi
# the sel chain, by its pid (the sel script execs the chain, so its own name is gone; the pid stays)
while kill -0 "${1:?the sel script pid}" 2>/dev/null; do sleep 30; done
C=$(readlink -f "$b")
OUTDIR=$out BLOCKS=15 "$chain" "$C" v5-0-1 sel-0-1
OUTDIR=$out OPS=select,range,scroller,canvas "$chain" "$C" d1-0-1
