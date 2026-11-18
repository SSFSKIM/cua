#!/bin/bash
# Task 99 (T7; from task 89's print-zero.sh): the :0 steps' commands as the T7 checkout's gate.mjs print gives them
# (acceptance on the pinned release, holder t7-arm64, the acceptance home and the out root), into
# zero-commands<suffix>.txt. gate.mjs print refuses, before launch, a :0 step whose scratch would leave run71's TMPDIR or
# whose decoy path is too long (T4's arm64 round, (b)). Extra gate.mjs flags (the unjudged passes: --newest <bin> --dev
# ...) follow `--`. g.sh runs gate.mjs under the run's Node 24.22.1, so the printed commands name it.
# usage: print-zero.sh <suffix> <out root> <step>... [-- <gate flags>]
set -u
T=/Users/new/.local/share/cua-171/task99
suffix=$1; outroot=$2; shift 2
steps=(); extra=()
while [ $# -gt 0 ]; do [ "$1" = -- ] && { shift; extra=("$@"); break; }; steps+=("$1"); shift; done
f=$T/zero-commands$suffix.txt
: > "$f"
for s in "${steps[@]}"; do
  echo "== $s" >> "$f"
  "$T/g.sh" print "$s" --pinned /Users/new/.local/share/cua-171/m5/home-arm64 --out "$outroot" --holder t7-arm64 ${extra[@]+"${extra[@]}"} >> "$f" || { echo "print $s failed"; exit 1; }
done
echo "wrote $f"
