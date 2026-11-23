#!/bin/bash
# Task 129: C1's and L4c's commands as the t129-x64 checkout's gate.mjs print gives them at H7 (acceptance on the pinned
# release, holder task129-x64, home-x64-042, the out root), into commands.txt. `print` writes a labelled stub of the
# step's directory (README.md, step.json) into the out root, and `run` refuses a step directory that exists, so each
# stub is moved aside into <out root>/print/ (kept as the print's record) before its step runs. Display-free.
# CMDS names the commands file (default commands.txt; L4d at H7.1: commands-l4d.txt).
# usage: [CMDS=<file name>] print-steps.sh <out root> <step>...
set -u
T=/Users/new/.local/share/cua-171/task129
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/t129-x64
ACC=/Users/new/.local/share/cua-171/m5/home-x64-042
OUT=$1; shift
f=$T/${CMDS:-commands.txt}
: > "$f"
mkdir -p "$OUT/print"
for s in "$@"; do
  echo "== $s" >> "$f"
  node "$G/scripts/linux-engine-gate/gate.mjs" print "$s" --pinned "$ACC" --out "$OUT" --holder task129-x64 >> "$f" || { echo "print $s failed"; exit 1; }
  mv "$OUT/$s.pinned-release" "$OUT/print/$s.pinned-release"
done
echo "wrote $f"
cat "$f"
