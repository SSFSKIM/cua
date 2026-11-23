#!/bin/bash
# Task 123: the x64 checkout for H6, a fresh worktree detached at H6 = 69bd7993.
set -euo pipefail
cd /Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171
git worktree add --detach /Users/new/Developer/GitHub/cua/.claude/worktrees/t123-x64 69bd7993e1f1cb252574939bd6e8e80674bab5b8
cd /Users/new/Developer/GitHub/cua/.claude/worktrees/t123-x64
git rev-parse HEAD
git status --porcelain | wc -l
