#!/bin/bash
# task 128: gate.mjs's launches and the drop-signals steps' plan contents at a head, on an architecture, each head
# printed by its own launch-plan.mjs (the review of cf1ef10f, finding 5, changed the renderer itself: it reads each
# launch's arguments through the harness's parser, which a head before it does not have). Each head's tree is exported
# to the same path and printed under one fixed environment with the same arguments; nothing is launched.
#   compare.sh <name> <commit> <arch>
set -u
repo=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/m5-h7-128
T=/Users/new/.local/share/cua-171/task128
C=$T/cmp
name=$1; commit=$2; arch=$3
tree=$C/tree
mkdir -p "$C"
rm -rf "$tree" "$C/out"
mkdir -p "$tree"
git -C "$repo" archive "$commit" | tar -x -C "$tree"
cd "$tree"
env -i HOME="$HOME" PATH=/usr/local/bin:/usr/bin:/bin LANG=C.UTF-8 node scripts/linux-engine-gate/launch-plan.mjs \
  --pinned /Users/new/.local/share/cua-171/task121/home/.local/share/cua --out "$C/out" --arch "$arch" > "$C/$name.txt" 2> "$C/$name.err"
echo "$name ($commit, $arch) exit $? $(wc -l < "$C/$name.txt") lines sha256 $(sha256sum < "$C/$name.txt" | cut -c1-64)"
rm -rf "$tree" "$C/out"
