#!/bin/bash
# Task 109 (from task 99's print-zero-h4.sh): the :0 steps' commands as the H5 checkout's gate.mjs print gives them
# (the pinned release's 0.4.1 acceptance home, holder task109-arm64, the out root), into zero-commands<suffix>.txt;
# extra gate.mjs flags follow `--` (F2 and F3: --dev; F3 also --newest <bin>). gate.mjs print refuses, before launch, a
# :0 step whose scratch would leave run71's TMPDIR or whose decoy path is too long.
# usage: print-zero.sh <suffix> <out root> <step>... [-- <gate flags>]
set -u
T=/Users/new/.local/share/cua-171/task109
suffix=$1; outroot=$2; shift 2
steps=(); extra=()
while [ $# -gt 0 ]; do [ "$1" = -- ] && { shift; extra=("$@"); break; }; steps+=("$1"); shift; done
f=$T/zero-commands$suffix.txt
: > "$f"
for s in "${steps[@]}"; do
  echo "== $s" >> "$f"
  "$T/g5.sh" print "$s" --pinned /Users/new/.local/share/cua-171/m5/home-arm64-041 --out "$outroot" --holder task109-arm64 ${extra[@]+"${extra[@]}"} >> "$f" || { echo "print $s failed"; exit 1; }
done
echo "wrote $f"
