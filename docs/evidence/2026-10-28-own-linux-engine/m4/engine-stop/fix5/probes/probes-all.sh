#!/bin/bash
# Fix 4's regressions (e) through cua serve: the supervisor SIGKILLed, held and unheld, and the worker SIGKILLed on its
# own, sandboxed and disabled; fix 4's head with its musl engine, and fix 3's head (305d8c10, exported) with its own.
# usage: probes-all.sh <fix-4 musl engine>
d=<fix5>
wt=<worktree>
head=$1
fix3=<home>/.local/share/cua-171/task57-fix2/build/d4f1faee820fed776fa160f54fc864519663702c/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
old=$d/tree-305d8c10
if [ ! -d "$old" ]; then
  mkdir -p "$old"
  git -C "$wt" archive 305d8c10 bin src package.json runtime docs/cua-api | tar -x -C "$old"
  ln -s "$wt/node_modules" "$old/node_modules"
fi
for mode in held unheld worker worker-busy; do
  for sb in scoped disabled; do
    extra=(); [ $sb = disabled ] && extra=(CUA_SHIM_SANDBOX=disabled)
    [ "$ONLY" != fix3 ] && bash $d/probe-shim.sh head-$mode-$sb "$wt" "$head" $mode "${extra[@]}" | grep -E '^\{"summary'
    [ "$ONLY" != head ] && bash $d/probe-shim.sh fix3-$mode-$sb "$old" "$fix3" $mode "${extra[@]}" | grep -E '^\{"summary'
  done
done
