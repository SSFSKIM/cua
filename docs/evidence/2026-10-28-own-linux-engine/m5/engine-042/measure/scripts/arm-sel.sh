#!/bin/bash
# Task 116: after arm-plan.sh ends, V5 scene's own no-take control at twice the load on wave 2 (sel-2-1, sel-2-2).
T=/Users/new/.local/share/cua-171/task116
while pgrep -f "task116/scripts/arm-plan.sh|scripts/arm-start.sh|scripts/arm-resume.sh" > /dev/null; do sleep 30; done
OUTDIR=$T/arm64-w2 BLOCKS=25 exec "$T/scripts/arm-chain.sh" "$(readlink -f "$T/bin/wave2-arm64")" sel-2-1 sel-2-2
