#!/bin/bash
# Task 126 on the arm64 VM: the prototype's checkout, detached at its commit, beside the others.
set -u
cd /Users/new/Developer/GitHub/cua || exit 2
git fetch -q origin m5-p459
[ -d .claude/worktrees/t126-p459 ] || git worktree add --detach .claude/worktrees/t126-p459 "$1"
git -C .claude/worktrees/t126-p459 checkout -q --detach "$1"
git -C .claude/worktrees/t126-p459 log --oneline -1
git -C .claude/worktrees/t126-p459 status --porcelain | wc -l
