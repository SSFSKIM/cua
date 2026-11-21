#!/bin/bash
# Task 123 (from task 105's print-zero.sh): the :0 steps' commands as the t123-x64 checkout's gate.mjs print gives them
# (acceptance on the pinned release, holder task123-x64, home-x64-042 and the out root), into
# zero-commands<suffix>.txt. Extra gate.mjs flags follow `--`.
# usage: print-zero.sh <suffix> <out root> <step>... [-- <gate flags>]
set -u
T=/Users/new/.local/share/cua-171/task123
suffix=$1; outroot=$2; shift 2
steps=(); extra=()
while [ $# -gt 0 ]; do [ "$1" = -- ] && { shift; extra=("$@"); break; }; steps+=("$1"); shift; done
f=$T/zero-commands$suffix.txt
: > "$f"
for s in "${steps[@]}"; do
  echo "== $s" >> "$f"
  "$T/g.sh" print "$s" --pinned /Users/new/.local/share/cua-171/m5/home-x64-042 --out "$outroot" --holder task123-x64 ${extra[@]+"${extra[@]}"} >> "$f" || { echo "print $s failed"; exit 1; }
done
echo "wrote $f"
