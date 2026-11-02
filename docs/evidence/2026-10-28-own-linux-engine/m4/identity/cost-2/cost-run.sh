#!/usr/bin/env bash
# Item 3 of T5's second fix round: does the confirmation cost anything outside duplicates? The fix's candidate (--cua)
# against T4's head (b8b79a25, built the same way) in both vendor lanes, on a warm non-duplicate tree read and element
# actions in gedit and Chrome, judged by Acceptance 3's interval rule (21 warm samples a side). A development run.
set -uo pipefail
HERE="$HOME/.local/share/cua-171/task38"
T37="$HOME/.local/share/cua-171/task37"
WT=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171
OUT="$WT/docs/evidence/2026-10-28-own-linux-engine/m4/identity/cost"
cd "$WT"
export DISPLAY=:0 XAUTHORITY="$HOME/.Xauthority"
rm -rf "$OUT"
"$T37/stray-check.sh" > "$HERE/cost-stray-before.txt" 2>&1
"$T37/display-check.sh" > "$HERE/cost-display-before.txt" 2>&1
node scripts/linux-engine-diff.mjs --dev --vendor "$HERE/engine-t4/cua-engine" --newest "$HERE/engine-t4/cua-engine" \
  --cua "$HERE/engine/cua-engine" --scene gedit,chrome,chrome-input --ops tree,click_element,type_text,clipboard_read \
  --blocks 3 --samples-tree 7 --samples-input 7 --samples-text 7 --run t5-fix2-cost --out "$OUT"
echo "exit $?"
"$T37/stray-check.sh" > "$HERE/cost-stray-after.txt" 2>&1
"$T37/display-check.sh" > "$HERE/cost-display-after.txt" 2>&1
