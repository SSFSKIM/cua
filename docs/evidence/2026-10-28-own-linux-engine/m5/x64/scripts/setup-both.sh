#!/bin/bash
# task 89: both checkouts' installs, each under the lock with its own timeout (T5's at H, then main's at b99232de)
T=/Users/new/.local/share/cua-171/task89
W=/Users/new/Developer/GitHub/cua/.claude/worktrees
cd "$T"
/Users/new/.local/share/cua-171/locked.sh t5-x64 timeout -s TERM -k 120 45m "$T/setup.sh" "$W/t5-x64" > setup-t5.log 2>&1
echo "t5 exit $?" >> setup-t5.log
/Users/new/.local/share/cua-171/locked.sh t5-x64 timeout -s TERM -k 120 45m "$T/setup.sh" "$W/t5-main" --no-xprobe > setup-main.log 2>&1
echo "main exit $?" >> setup-main.log
