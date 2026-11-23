#!/bin/bash
# Task 87 (from task 79's run-zero2.sh, commands in task87/x64/, zero.log in the pilot's out root): one :0 step of the
# x64 pilot's sitting, its command exactly as gate.mjs print gave it (print-zero.sh), under run71.sh and wrap71 (task
# 50's guards). Refuses while hold-sittings exists. Task 59's Mozilla Firefox first on PATH; a Firefox step is refused
# unless PATH resolves firefox to task 59's, before anything runs. Prints the step's outcome and its guard records.
# usage: run-zero.sh <V1..V5|Z0>
set -u
D=/Users/new/.local/share/cua-171
step=$1
OUTROOT=$D/m5/pilot-x64/out
CMDS=$D/task87/x64/zero-commands.txt
[ -e "$D/hold-sittings" ] && { echo "hold-sittings present: $step not started"; exit 5; }
cmd=$(awk -v s="== $step" '$0 == s {getline; print; exit}' "$CMDS")
[ -n "$cmd" ] || { echo "no command for $step in $CMDS"; exit 2; }
export PATH=$D/task59/bin:$PATH
ff=$(command -v firefox)
echo "firefox on PATH: $ff"
if grep -q firefox <<<"$cmd" && [ "$ff" != "$D/task59/bin/firefox" ]; then
  echo "refused: $step drives Firefox, and PATH resolves firefox to $ff, not $D/task59/bin/firefox"
  exit 6
fi
O=$OUTROOT/$step.development-run.pilot
echo "$(date -u +%FT%TZ) start $step ($OUTROOT)" | tee -a "$OUTROOT/zero.log"
eval "$cmd"
code=$?
echo "$(date -u +%FT%TZ) end $step exit $code ($OUTROOT)" | tee -a "$OUTROOT/zero.log"
echo "--- owner-baseline"; cat "$O/owner-baseline.txt" 2>/dev/null
echo "--- pointer"; cat "$O/pointer.txt" 2>/dev/null
echo "--- wrap.out tail"; tail -6 "$O/wrap.out" 2>/dev/null
exit $code
