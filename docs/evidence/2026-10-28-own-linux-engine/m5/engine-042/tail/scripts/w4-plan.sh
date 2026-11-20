#!/bin/bash
# Task 118, ruling 908: wave 4's head (f8bd6949) built now (its build waits for the lock between the running plan's
# runs), then, once task 118's first plan (plan.sh) has ended, V5 at twice the load on wave 4's checkout and engine:
# one run of 25 blocks a Chrome version (75 in-front samples each, at least 60 asked), 156 then 158.
set -u
T=/Users/new/.local/share/cua-171/task118
W4=/Users/new/Developer/GitHub/cua/.claude/worktrees/t118-wave4
"$T/scripts/build.sh" "$W4" arm64 > "$T/build-arm64-w4.out" 2>&1
bin=$(awk '/cua-engine 0.4.2/ {print $1}' "$T/build-arm64-w4.out")
[ -x "$bin" ] || { echo "$(date -u +%FT%TZ) wave 4: no binary: $(cat "$T/build-arm64-w4.out")" >> "$T/chain.log"; exit 1; }
echo "$(date -u +%FT%TZ) built wave 4 $(cat "$T/build-arm64-w4.out")" >> "$T/chain.log"
while pgrep -f 'scripts/plan\.sh' > /dev/null; do sleep 30; done
echo "$(date -u +%FT%TZ) the first plan ended; wave 4's block starts" >> "$T/chain.log"
W=$W4 "$T/scripts/chain2.sh" "$bin" v5w4-156-1 v5w4-158-1
