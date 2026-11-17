#!/bin/bash
# task 89: the T5 checkout's gate runner (t5-x64 at H = fefe306c), its arguments as given.
exec node /Users/new/Developer/GitHub/cua/.claude/worktrees/t5-x64/scripts/linux-engine-gate/gate.mjs "$@"
