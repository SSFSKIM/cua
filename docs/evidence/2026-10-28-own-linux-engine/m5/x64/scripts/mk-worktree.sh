#!/bin/bash
# task 89: the T5 checkout, a fresh worktree detached at H (fefe306c)
set -euo pipefail
cd /Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171
git worktree add --detach /Users/new/Developer/GitHub/cua/.claude/worktrees/t5-x64 fefe306c
cd /Users/new/Developer/GitHub/cua/.claude/worktrees/t5-x64
git rev-parse HEAD
git status --porcelain | wc -l
