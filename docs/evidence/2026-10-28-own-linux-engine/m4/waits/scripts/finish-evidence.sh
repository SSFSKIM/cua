#!/bin/bash
# Copies the twice-the-load sittings, writes each activate-then-click sitting's analysis.md, and copies the scripts.
set -u
. "$(dirname "$0")/env.sh"
E=$WT/docs/evidence/2026-10-28-own-linux-engine/m4/waits
R=$T/runs
python3 "$T/scripts/copy-evidence.py" "$R" "$E" c3-readiness-all-load2=final/readiness-all-load2 c3-load2-pointer=final/pointer-load2 c3-load2-move=final/move-load2 c3-load2-cell=final/activate-click-load2 c2-load2-cell=no-pause/activate-click-load2
for p in final/activate-click-idle:c3-idle-cell final/activate-click-load2:c3-load2-cell no-pause/activate-click-idle:c2-idle-cell no-pause/activate-click-load2:c2-load2-cell; do
  d=${p%%:*}
  s=${p##*:}
  {
    echo "# $s: focus, raise and press per activation"
    echo
    node "$T/scripts/analyze-order.mjs" "$R/$s.order.jsonl"
    echo
    node "$T/scripts/analyze-order.mjs" "$R/$s.order.jsonl" --json | node "$T/scripts/press-gaps.mjs"
  } > "$E/$d/analysis.md"
done
mkdir -p "$E/scripts"
cp "$T"/scripts/*.sh "$T"/scripts/*.mjs "$T"/scripts/*.py "$E/scripts/"
grep -rl "$HOME" "$E" || echo "no home paths"
