#!/bin/bash
# Task 78: a development run of the redefined settle cells (Chrome's and Electron's secondary_action on the Native
# button, the menu_unconfirmed control, and right_click beside them), shipped lane, idle, a few trials, on the
# experiment's own display, the fix's candidate; under locked.sh t78-fix. Not counted.
set -u
C=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171
OUT=$1
[ -e /Users/new/.local/share/cua-171/hold-sittings ] && { echo "hold-sittings present: not running"; exit 3; }
export PATH=/Users/new/.local/share/cua-171/bin:$PATH
mkdir -p "$OUT"
cd "$C"
node scripts/linux-engine-diff.mjs --experiment settle --lanes shipped --family chrome,electron --kinds secondary_action,menu_unconfirmed,right_click --routes background --trials ${TRIALS:-5} --cua /Users/new/.local/share/cua-171/t78/candidate/cua-engine --out "$OUT" --run t78-settle-pilot > "$OUT/stdout.log" 2> "$OUT/stderr.log"
echo "settle exit $?"
