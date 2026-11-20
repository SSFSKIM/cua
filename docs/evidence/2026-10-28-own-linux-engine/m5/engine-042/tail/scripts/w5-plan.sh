#!/bin/bash
# Task 118, ruling 912: wave 5's head (f10946bf), the counted block. Its build now (it waits for the lock between the
# running runs), then, once task 118's earlier plans (plan.sh, w4-plan.sh) have ended, on wave 5's checkout (its
# harness and judge) and engine, under $T/w5: V5 at twice the load, one run of 25 blocks a Chrome version (75 in-front
# samples each, at least 60 asked), 156 then 158; then 20 gate-form K1 and 20 K2 canary runs, alternating.
set -u
T=/Users/new/.local/share/cua-171/task118
W5=/Users/new/Developer/GitHub/cua/.claude/worktrees/t118-wave5
"$T/scripts/build.sh" "$W5" arm64 > "$T/build-arm64-w5.out" 2>&1
bin=$(awk '/cua-engine 0.4.2/ {print $1}' "$T/build-arm64-w5.out")
[ -x "$bin" ] || { echo "$(date -u +%FT%TZ) wave 5: no binary: $(cat "$T/build-arm64-w5.out")" >> "$T/chain.log"; exit 1; }
echo "$(date -u +%FT%TZ) built wave 5 $(cat "$T/build-arm64-w5.out")" >> "$T/chain.log"
while pgrep -f 'scripts/(plan|w4-plan)\.sh' > /dev/null; do sleep 30; done
echo "$(date -u +%FT%TZ) the earlier plans ended; wave 5's counted block starts" >> "$T/chain.log"
parts=(v5w5-156-1 v5w5-158-1); for n in $(seq -w 1 20); do parts+=(k1-$n k2-$n); done
TAG=w5 W=$W5 "$T/scripts/chain3.sh" "$bin" "${parts[@]}"
