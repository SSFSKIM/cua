#!/bin/bash
# Copies task 66's sittings, analyses and scripts into the evidence directory (copy-evidence.py labels home paths).
# usage: finish-evidence.sh <sitting>=<evidence name>...
set -euo pipefail
t=$HOME/.local/share/cua-171/task66
e=$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m4/drag-motion
mkdir -p "$e/analysis" "$e/scripts"
python3 -I "$t/scripts/copy-evidence.py" "$t/runs" "$e" "$@"
cp "$t"/analysis/*.md "$t"/analysis/*.svg "$e/analysis/"
for f in thumb-plot.mjs build-tree.sh held-final.sh ff-held-sweep.sh ff-held-2.sh live-suite.sh drag.sh env.sh private.sh \
  private-run.mjs norecord.mjs build-musl.sh export-harness.sh copy-evidence.py finish-evidence.sh final-idle.sh load-rest.sh \
  ff-held-rest-load.sh live-one.sh live-red.sh; do
  sed -e "s#$HOME#<home>#g" "$t/scripts/$f" > "$e/scripts/$f"
done
cp "$t/xorg/dummy.conf" "$e/scripts/xorg-dummy.conf"
sed -e "s#$HOME#<home>#g" "$t/xorg/xtools-xorg.patch" > "$e/scripts/xtools-xorg.patch"
du -sh "$e"
grep -rl "$HOME" "$e" || echo "no home paths"
