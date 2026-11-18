#!/bin/bash
# task 99: the T7 checkout's gate runner (t7-arm64 at H'''), under the run's Node 24.22.1.
export PATH=/Users/new/.local/share/cua-171/node24/bin:$PATH
exec node /Users/new/Developer/GitHub/cua/.claude/worktrees/t7-arm64/scripts/linux-engine-gate/gate.mjs "$@"
