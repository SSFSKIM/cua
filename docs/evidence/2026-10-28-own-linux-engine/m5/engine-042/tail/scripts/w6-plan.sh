#!/bin/bash
# Task 118, ruling 913: wave 6's head (the bus write path only), a short arm smoke beside the counted block. Its build
# now (it waits for the lock between the running runs), then, once task 118's earlier plans (plan.sh, w4-plan.sh,
# w5-plan.sh) have ended, on wave 6's checkout (its harness and judge) and engine, under $T/w6: V5 at twice the load,
# one run of 7 blocks a Chrome version (21 in-front samples each, 20 asked), 156 then 158; then 5 gate-form K1 and 5 K2
# canary runs, alternating.
# usage: w6-plan.sh <wave 6's checkout>
set -u
T=/Users/new/.local/share/cua-171/task118
W6=$1
"$T/scripts/build.sh" "$W6" arm64 > "$T/build-arm64-w6.out" 2>&1
bin=$(awk '/cua-engine 0.4.2/ {print $1}' "$T/build-arm64-w6.out")
[ -x "$bin" ] || { echo "$(date -u +%FT%TZ) wave 6: no binary: $(cat "$T/build-arm64-w6.out")" >> "$T/chain.log"; exit 1; }
echo "$(date -u +%FT%TZ) built wave 6 $(cat "$T/build-arm64-w6.out")" >> "$T/chain.log"
while pgrep -f 'scripts/(plan|w4-plan|w5-plan)\.sh' > /dev/null; do sleep 30; done
echo "$(date -u +%FT%TZ) the earlier plans ended; wave 6's smoke starts" >> "$T/chain.log"
parts=(v5w6-156-1 v5w6-158-1); for n in $(seq -w 1 5); do parts+=(k1-$n k2-$n); done
BLOCKS=7 TAG=w6 W=$W6 "$T/scripts/chain3.sh" "$bin" "${parts[@]}"
