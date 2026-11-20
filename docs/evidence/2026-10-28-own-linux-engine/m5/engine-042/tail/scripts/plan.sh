#!/bin/bash
# Task 118's plan on arm64: the build, then V5 at twice the load alternating Chrome 156 and 158 (3 runs of 25 blocks
# each, 225 in-front samples a version), after one canary pair (K1, K2) to prove the step starts on arm64, then 20 gate-form canary runs a version, K1 and K2 alternating.
set -u
T=/Users/new/.local/share/cua-171/task118
W=/Users/new/Developer/GitHub/cua/.claude/worktrees/t116-measure042
"$T/scripts/build.sh" "$W" arm64 > "$T/build-arm64.out" 2>&1
bin=$(awk '/cua-engine 0.4.2/ {print $1}' "$T/build-arm64.out")
[ -x "$bin" ] || { echo "$(date -u +%FT%TZ) no binary: $(cat "$T/build-arm64.out")" >> "$T/chain.log"; exit 1; }
echo "$(date -u +%FT%TZ) built $(cat "$T/build-arm64.out")" >> "$T/chain.log"
"$T/scripts/chain.sh" "$bin" k1-01 k2-01 v5-156-1 v5-158-1 v5-156-2 v5-158-2 v5-156-3 v5-158-3 || exit $?
parts=(); for n in $(seq -w 1 20); do parts+=(k1-$n k2-$n); done
"$T/scripts/chain.sh" "$bin" "${parts[@]}"
