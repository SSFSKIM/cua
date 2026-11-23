#!/bin/bash
# task 109: the H5 checkout's gate runner (t109-h5 at 7d554dea), under the run's Node 24.22.1.
export PATH=/Users/new/.local/share/cua-171/node24/bin:$PATH
exec node /Users/new/Developer/GitHub/cua/.claude/worktrees/t109-h5/scripts/linux-engine-gate/gate.mjs "$@"
