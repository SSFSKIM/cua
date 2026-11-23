#!/bin/bash
# task 121: the development runs of C1 and L4c as recast (ruling 931), the knife-edge ride-along at idle and at twice the
# load, then ruling 930's canary proof (K2 five times, K1 once) on x64 against the pinned 0.4.2 engine of the run home.
# The worktree stays clean throughout (the K steps run as the gate runs them, which refuses an unclean checkout).
set -u
repo=/Users/new/Developer/GitHub/cua/.claude/worktrees/agent-a4d8cf4660dd54f80
T=/Users/new/.local/share/cua-171/task121
home=$T/home/.local/share/cua
cd "$repo"
echo "head $(git rev-parse HEAD) clean=$(git status --porcelain | wc -l)"
for s in C1 L4c; do
  node scripts/linux-engine-gate/gate.mjs run "$s" --pinned "$home" --dev --out "$T/gate-dev" --holder m5-h6 > "$T/gate-dev-$s.log" 2>&1
  echo "$s (development run) exit $?"
done
"$T/sweep.sh" edge-idle t14-late-edge; echo "t14-late-edge idle exit $?"
"$T/sweep.sh" edge-load2 t14-late-edge --load-factor 2; echo "t14-late-edge load2 exit $?"
for k in 1 2 3 4 5; do
  node scripts/linux-engine-gate/gate.mjs run K2 --pinned "$home" --out "$T/k2-$k" --holder m5-h6 > "$T/k2-$k.log" 2>&1
  echo "K2 run $k exit $?"
done
node scripts/linux-engine-gate/gate.mjs run K1 --pinned "$home" --out "$T/k1-1" --holder m5-h6 > "$T/k1-1.log" 2>&1
echo "K1 exit $?"
echo "head $(git rev-parse HEAD) clean=$(git status --porcelain | wc -l)"
