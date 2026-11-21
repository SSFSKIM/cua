#!/bin/bash
# task 122: the H6 checkout's gate runner (t122-h6 at 69bd7993), under the run's Node 24.22.1.
export PATH=/Users/new/.local/share/cua-171/node24/bin:$PATH
exec node /Users/new/Developer/GitHub/cua/.claude/worktrees/t122-h6/scripts/linux-engine-gate/gate.mjs "$@"
