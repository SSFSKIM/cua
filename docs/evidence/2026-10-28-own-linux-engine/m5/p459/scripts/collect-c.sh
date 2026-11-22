#!/bin/bash
# Task 126: the option (c) cost tables and the V5 gate estimates into the evidence (ruling 981).
set -u
S=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/m5-p459-scratch
E=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/m5-p459/docs/evidence/2026-10-28-own-linux-engine/m5/p459
D=/Users/new/.local/share/cua-171
mkdir -p "$E/c-cost" "$E/v5-gate"
cp "$S/c-cost.mjs" "$S/v5-gate.mjs" "$S/collect-c.sh" "$S/p459-x64.sh" "$S/arm-chain2.sh" "$E/scripts/"
for set in "$@"; do
  ssh cua-171-arm64 "cd $D && node task126/c-cost.mjs task126/out/$set" > "$E/c-cost/arm64-$set.md"
done
ssh cua-171-arm64 "cd $D && node task126/c-cost.mjs m5/a953-arm64-h6/t14-floor/run/results.jsonl" > "$E/c-cost/arm64-a953-t14-floor-042.md"
ssh cua-171-arm64 "node $D/task126/v5-gate.mjs $D/m5/out-arm64-h6/V5.pinned-release/run/results.jsonl" > "$E/v5-gate/arm64-h6.md"
node "$S/v5-gate.mjs" "$D/m5/zero-x64-h6/V5.pinned-release/run/results.jsonl" > "$E/v5-gate/x64-h6.md"
[ -d "$D/task126/x64/idle-floor" ] && node "$S/c-cost.mjs" "$D/task126/x64/idle-floor" > "$E/c-cost/x64-idle-floor.md"
ls "$E/c-cost" "$E/v5-gate"
