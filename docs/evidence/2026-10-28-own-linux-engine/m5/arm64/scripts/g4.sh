#!/bin/bash
# task 99 (T7 part 2): the H'''' checkout's gate runner (t7-h4 at 3b5c0441), under the run's Node 24.22.1.
export PATH=/Users/new/.local/share/cua-171/node24/bin:$PATH
exec node /Users/new/Developer/GitHub/cua/.claude/worktrees/t7-h4/scripts/linux-engine-gate/gate.mjs "$@"
