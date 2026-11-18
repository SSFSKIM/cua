#!/bin/bash
# Task 98: one run of drive98.sh on the x64 host from this task's own worktree, started in the background (a run
# outlasts the shell that starts it); its log is task98/out/<run name>.nohup.
# usage: x64-start.sh <run name> <plan> idle|load2 [engine binary] [extra harness args...]
T=/Users/new/.local/share/cua-171/task98
mkdir -p "$T/out"
[ -e "$T/bin" ] || ln -s /Users/new/.local/share/cua-171/l4a-fix/bin "$T/bin"
export T98_CHECKOUT=/Users/new/Developer/GitHub/cua/.claude/worktrees/agent-a8036331f3e034d27
cd "$T" || exit 2
nohup bin/drive98.sh "$@" > "out/$1.nohup" 2>&1 &
sleep 4
tail -2 out/driver.log | cut -c1-250
