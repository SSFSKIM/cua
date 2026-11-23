#!/bin/bash
# task 125 (ruling 954): gate.mjs's launches and the drop-signals steps' plan contents at a head, on an architecture.
# Each head's tree is exported to the same path, this head's launch-plan.mjs put beside its gate.mjs (the same file for
# every head), the plan printed under one fixed environment with the same arguments.
#   compare.sh <name> <commit> <arch>
set -u
repo=/Users/new/Developer/GitHub/cua/.claude/worktrees/agent-a4d8cf4660dd54f80
T=/Users/new/.local/share/cua-171/task125
C=$T/cmp
name=$1; commit=$2; arch=$3
tree=$C/tree
rm -rf "$tree" "$C/out"
mkdir -p "$tree"
git -C "$repo" archive "$commit" | tar -x -C "$tree"
cp "$repo/scripts/linux-engine-gate/launch-plan.mjs" "$tree/scripts/linux-engine-gate/launch-plan.mjs"
cd "$tree"
env -i HOME="$HOME" PATH=/usr/local/bin:/usr/bin:/bin LANG=C.UTF-8 node scripts/linux-engine-gate/launch-plan.mjs \
  --pinned /Users/new/.local/share/cua-171/task121/home/.local/share/cua --out "$C/out" --arch "$arch" > "$C/$name.txt" 2> "$C/$name.err"
echo "$name ($commit, $arch) exit $? $(wc -l < "$C/$name.txt") lines sha256 $(sha256sum < "$C/$name.txt" | cut -c1-64)"
rm -rf "$tree" "$C/out"
