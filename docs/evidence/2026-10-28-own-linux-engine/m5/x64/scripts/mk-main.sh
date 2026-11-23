#!/bin/bash
# task 89 (ruling 743): main at b99232de in a second detached worktree, for npm test's platform baseline on this VM
set -euo pipefail
cd /Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171
git cat-file -t b99232de
git worktree add --detach /Users/new/Developer/GitHub/cua/.claude/worktrees/t5-main b99232de
cd /Users/new/Developer/GitHub/cua/.claude/worktrees/t5-main
git rev-parse HEAD
git status --porcelain | wc -l
