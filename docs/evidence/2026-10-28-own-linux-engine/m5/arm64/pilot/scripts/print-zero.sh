#!/bin/bash
# Task 96 (from task 89's print-zero.sh): the :0 steps' commands as the pilot checkout's gate.mjs print gives them in
# the pilot form (a development run on the pinned release, --pilot 2, holder t96-arm64, the pilot home and the out
# root), into zero-commands<suffix>.txt. g.sh runs gate.mjs under the run's Node 24.22.1, so the printed commands name it.
# usage: print-zero.sh <suffix> <out root> <step>...
set -u
T=/Users/new/.local/share/cua-171/task96
suffix=$1; outroot=$2; shift 2
f=$T/zero-commands$suffix.txt
: > "$f"
for s in "$@"; do
  echo "== $s" >> "$f"
  "$T/g.sh" print "$s" --pinned /Users/new/.local/share/cua-171/m5/pilot-arm64/home --pilot 2 --out "$outroot" --holder t96-arm64 >> "$f" || { echo "print $s failed"; exit 1; }
done
echo "wrote $f"
