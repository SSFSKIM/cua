#!/bin/bash
# x64 V5 at H8 (task 123's print-zero.sh): the :0 step's command as the t129-x64 checkout's gate.mjs print gives it at
# H8 = 048140a2 (acceptance on the pinned release, holder h8-x64, home-x64-043, the out root), into
# zero-commands<suffix>.txt. gate.mjs print refuses, before launch, a :0 step whose scratch would leave run71's TMPDIR
# or whose decoy path is too long, and writes the step directory's labelled README. Display-free.
# usage: print-zero.sh <suffix> <out root> <step>...
set -u
T=/Users/new/.local/share/cua-171/v5h8
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/t129-x64
suffix=$1; outroot=$2; shift 2
f=$T/zero-commands$suffix.txt
: > "$f"
for s in "$@"; do
  echo "== $s" >> "$f"
  node "$G/scripts/linux-engine-gate/gate.mjs" print "$s" --pinned /Users/new/.local/share/cua-171/m5/home-x64-043 --out "$outroot" --holder h8-x64 >> "$f" || { echo "print $s failed"; exit 1; }
done
echo "wrote $f"
