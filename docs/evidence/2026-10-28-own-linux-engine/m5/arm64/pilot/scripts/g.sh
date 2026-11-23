#!/bin/bash
# task 96: the arm64 pilot checkout's gate runner (t96-arm64 at the VM's head), under the run's Node 24.22.1.
export PATH=/Users/new/.local/share/cua-171/node24/bin:$PATH
exec node /Users/new/Developer/GitHub/cua/.claude/worktrees/t96-arm64/scripts/linux-engine-gate/gate.mjs "$@"
