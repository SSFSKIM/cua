#!/bin/bash
# Task 98: chain2.sh on the x64 host from this task's own worktree, started in the background; its log is
# task98/out/x64-chain.nohup. The engine is the worktree's own release build; the pinned asset is copied from the x64
# pilot's run home (read, never run from).
# usage: x64-chain.sh <sha> <run>...
T=/Users/new/.local/share/cua-171/task98
mkdir -p "$T/out"
[ -e "$T/bin" ] || ln -s /Users/new/.local/share/cua-171/l4a-fix/bin "$T/bin"
export T98_CHECKOUT=/Users/new/Developer/GitHub/cua/.claude/worktrees/agent-a8036331f3e034d27
export T98_PINNED_SRC=/Users/new/.local/share/cua-171/m5/pilot-x64/home/engine/linux/cua-engine
cd "$T" || exit 2
nohup bin/chain2.sh "$@" >> out/x64-chain.nohup 2>&1 &
sleep 2
echo "x64 chain started: $*"
