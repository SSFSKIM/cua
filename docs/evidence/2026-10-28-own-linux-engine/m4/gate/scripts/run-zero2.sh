#!/bin/bash
# Task 76: one :0 step of the gate sitting, its command exactly as gate.mjs print gave it (run-zero.sh with the Firefox
# check; a new file, since V5's rerun was executing run-zero.sh when the check was added). Refuses while hold-sittings
# exists. Task 59's Mozilla Firefox first on PATH, as every M4 sitting had it (env.sh; gate.mjs DEFAULTS.firefoxDir for
# its own runs): the printed :0 command does not set it, and V5's first execution started the snap's firefox, which
# failed inside the guard (no systemd user bus). A Firefox step is refused unless PATH resolves firefox to task 59's
# (the design session, 2026-11-13), before anything runs. Prints the step's outcome and its guard records.
# usage: run-zero2.sh <V1..V5|Z0> [out root, default gate/out] [commands file suffix, e.g. -rerun1]
set -u
D=/Users/new/.local/share/cua-171
step=$1
OUTROOT=${2:-$D/gate/out}
CMDS=$D/task76/zero-commands${3:-}.txt
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
O=$OUTROOT/$step.release-gate
echo "$(date -u +%FT%TZ) start $step ($OUTROOT)" | tee -a "$D/gate/out/zero.log"
eval "$cmd"
code=$?
echo "$(date -u +%FT%TZ) end $step exit $code ($OUTROOT)" | tee -a "$D/gate/out/zero.log"
echo "--- owner-baseline"; cat "$O/owner-baseline.txt" 2>/dev/null
echo "--- pointer"; cat "$O/pointer.txt" 2>/dev/null
echo "--- wrap.out tail"; tail -6 "$O/wrap.out" 2>/dev/null
exit $code
