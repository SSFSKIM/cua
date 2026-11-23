#!/bin/bash
# Task 123 (from task 105's settle.sh): settle-check.mjs (t123-x64 at H6) over the step directories of an out root,
# into <name>.txt beside this script; prints each step's reading line (the engine lines are in the file).
# usage: settle.sh <name> <out root> <label glob, e.g. pinned-release>
set -u
T=/Users/new/.local/share/cua-171/task123
name=$1; out=$2; label=$3
node /Users/new/Developer/GitHub/cua/.claude/worktrees/t123-x64/scripts/linux-engine-gate/settle-check.mjs "$out"/*."$label" > "$T/$name.txt"
code=$?
echo "settle-check exit $code" >> "$T/$name.txt"
grep -v '^  ' "$T/$name.txt" | sed "s#$out/##" | cut -c1-500
