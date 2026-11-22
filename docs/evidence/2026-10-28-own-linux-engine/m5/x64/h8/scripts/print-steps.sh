#!/bin/bash
# Task 135 (task 129's print-steps.sh): the steps' commands as the t129-x64 checkout's gate.mjs print gives them at H8
# (acceptance on the pinned release, holder h8-x64, home-x64-043, the out root), into commands.txt. `print` writes a
# labelled stub of the step's directory and `run` refuses a directory that exists, so each stub is moved aside into
# <out root>/print/ (kept as the print's record) before its step runs. Display-free.
# usage: print-steps.sh <out root> <step>...
set -u
T=/Users/new/.local/share/cua-171/task135
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/t129-x64
ACC=/Users/new/.local/share/cua-171/m5/home-x64-043
OUT=$1; shift
f=$T/commands.txt
: > "$f"
mkdir -p "$OUT/print"
for s in "$@"; do
  echo "== $s" >> "$f"
  node "$G/scripts/linux-engine-gate/gate.mjs" print "$s" --pinned "$ACC" --out "$OUT" --holder h8-x64 >> "$f" || { echo "print $s failed"; exit 1; }
  mv "$OUT/$s.pinned-release" "$OUT/print/$s.pinned-release"
done
echo "wrote $f"
cat "$f"
