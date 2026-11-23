#!/bin/bash
# task 136: the H8 checkout's gate runner (t136-h8 at 048140a2), under the run's Node 24.22.1.
export PATH=/Users/new/.local/share/cua-171/node24/bin:$PATH
exec node /Users/new/Developer/GitHub/cua/.claude/worktrees/t136-h8/scripts/linux-engine-gate/gate.mjs "$@"
