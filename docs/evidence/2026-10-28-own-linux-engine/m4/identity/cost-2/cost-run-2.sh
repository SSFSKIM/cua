#!/usr/bin/env bash
# Item 3 of T5's second fix round: does the confirmation cost anything outside duplicates? The fix's candidate (--cua)
# against T4's head (b8b79a25, built the same way) in both vendor lanes, on a warm non-duplicate tree read and element
# actions in gedit and Chrome, judged by Acceptance 3's interval rule (21 warm samples a side). A development run.
set -uo pipefail
HERE="$HOME/.local/share/cua-171/task38"
T37="$HOME/.local/share/cua-171/task37"
WT=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171
OUT="$WT/docs/evidence/2026-10-28-own-linux-engine/m4/identity/cost-2"
cd "$WT"
export DISPLAY=:0 XAUTHORITY="$HOME/.Xauthority"
rm -rf "$OUT"
"$T37/stray-check.sh" > "$HERE/cost2-stray-before.txt" 2>&1
"$T37/display-check.sh" > "$HERE/cost2-display-before.txt" 2>&1
node scripts/linux-engine-diff.mjs --dev --vendor "$HERE/engine-t4/cua-engine" --newest "$HERE/engine-t4/cua-engine" \
  --cua "$HERE/engine/cua-engine" --scene gedit,chrome --ops tree,type_text,clipboard_read \
  --blocks 6 --samples-tree 14 --samples-input 14 --samples-text 14 --run t5-fix2-cost-2 --out "$OUT"
echo "exit $?"
"$T37/stray-check.sh" > "$HERE/cost2-stray-after.txt" 2>&1
"$T37/display-check.sh" > "$HERE/cost2-display-after.txt" 2>&1
