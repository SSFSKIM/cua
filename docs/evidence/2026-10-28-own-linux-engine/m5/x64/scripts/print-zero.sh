#!/bin/bash
# Task 89 (from task 87's print-zero.sh): the :0 steps' commands as the T5 checkout's gate.mjs print gives them
# (acceptance on the pinned release, holder t5-x64, the acceptance home and the outroot), into zero-commands<suffix>.txt.
# Extra gate.mjs flags (F3's lane: --newest <bin> --dev ...) follow `--`.
# usage: print-zero.sh <suffix> <out root> <step>... [-- <gate flags>]
set -u
T=/Users/new/.local/share/cua-171/task89
suffix=$1; outroot=$2; shift 2
steps=(); extra=()
while [ $# -gt 0 ]; do [ "$1" = -- ] && { shift; extra=("$@"); break; }; steps+=("$1"); shift; done
f=$T/zero-commands$suffix.txt
: > "$f"
for s in "${steps[@]}"; do
  echo "== $s" >> "$f"
  "$T/g.sh" print "$s" --pinned /Users/new/.local/share/cua-171/m5/home-x64 --out "$outroot" --holder t5-x64 ${extra[@]+"${extra[@]}"} >> "$f" || { echo "print $s failed"; exit 1; }
done
echo "wrote $f"
