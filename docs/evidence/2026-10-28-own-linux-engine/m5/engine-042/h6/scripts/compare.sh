#!/bin/bash
# task 121 (ruling 929.2): gate.mjs's launches at two heads, byte for byte. Each head's tree is exported to the same
# path (so the runner's root, and every path it prints, are the same), launch-plan.mjs (this head's, the same file for
# both) is put beside its gate.mjs, and the plan printed under one fixed environment with the same arguments.
#   compare.sh <name> <commit>
set -u
repo=/Users/new/Developer/GitHub/cua/.claude/worktrees/agent-a4d8cf4660dd54f80
T=/Users/new/.local/share/cua-171/task121
C=$T/cmp
name=$1; commit=$2; skip=${3:-^K}
tree=$C/tree
rm -rf "$tree" "$C/out"
mkdir -p "$tree"
git -C "$repo" archive "$commit" | tar -x -C "$tree"
cp "$repo/scripts/linux-engine-gate/launch-plan.mjs" "$tree/scripts/linux-engine-gate/launch-plan.mjs"
cd "$tree"
env -i HOME="$HOME" PATH=/usr/local/bin:/usr/bin:/bin LANG=C.UTF-8 node scripts/linux-engine-gate/launch-plan.mjs \
  --pinned "$T/home/.local/share/cua" --out "$C/out" --skip "$skip" > "$C/$name.txt" 2> "$C/$name.err"
echo "$name ($commit) exit $? $(wc -l < "$C/$name.txt") lines sha256 $(sha256sum < "$C/$name.txt" | cut -c1-64)"
rm -rf "$tree" "$C/out"
