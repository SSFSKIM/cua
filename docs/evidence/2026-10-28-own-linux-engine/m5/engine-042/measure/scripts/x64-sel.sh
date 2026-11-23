#!/bin/bash
# Task 116: after x64-plan2.sh ends, V5's scene's own no-take control at twice the load on wave 2 (sel-2-1, sel-2-2).
T=/Users/new/.local/share/cua-171/task116
while pgrep -f "scripts/x64-plan2.sh" > /dev/null; do sleep 30; done
OUTDIR=$T/x64-w2 BLOCKS=26 exec "$T/scripts/x64-chain.sh" "$(readlink -f "$T/bin/wave2-x64")" sel-2-1 sel-2-2
