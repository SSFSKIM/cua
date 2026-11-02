#!/bin/bash
# track.sh <name> <trials> [label=flags]...: track.mjs on the VM's display, output under task20b/runs/<name>.jsonl
# (log beside it). CUA_BIN defaults to the worktree's release build.
set -u
T=/Users/new/.local/share/cua-171/task20b
name=$1
shift
export DISPLAY=:0 XAUTHORITY=/Users/new/.Xauthority
export CUA_BIN=${CUA_BIN:-/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/native/linux-engine/target/release/cua-engine}
cd /Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171 || exit 1
node "$T/track.mjs" "$T/runs/$name.jsonl" "$@" > "$T/runs/$name.log" 2>&1
code=$?
echo "exit $code"
exit $code
