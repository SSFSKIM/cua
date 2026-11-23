#!/bin/bash
# Task 136 (from task 109's print-zero.sh): the :0 steps' commands as the H8 checkout's gate.mjs print gives them
# (the pinned release's 0.4.3 acceptance home, holder h8-arm64, the out root), into zero-commands<suffix>.txt;
# extra gate.mjs flags follow `--` (none in task 136). gate.mjs print refuses, before launch, a
# :0 step whose scratch would leave run71's TMPDIR or whose decoy path is too long.
# usage: print-zero.sh <suffix> <out root> <step>... [-- <gate flags>]
set -u
T=/Users/new/.local/share/cua-171/task136
suffix=$1; outroot=$2; shift 2
steps=(); extra=()
while [ $# -gt 0 ]; do [ "$1" = -- ] && { shift; extra=("$@"); break; }; steps+=("$1"); shift; done
f=$T/zero-commands$suffix.txt
: > "$f"
for s in "${steps[@]}"; do
  echo "== $s" >> "$f"
  "$T/g8.sh" print "$s" --pinned /Users/new/.local/share/cua-171/m5/home-arm64-043 --out "$outroot" --holder h8-arm64 ${extra[@]+"${extra[@]}"} >> "$f" || { echo "print $s failed"; exit 1; }
done
echo "wrote $f"
