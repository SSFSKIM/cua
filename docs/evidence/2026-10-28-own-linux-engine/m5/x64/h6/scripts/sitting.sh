#!/bin/bash
# Task 123 (from task 105's sitting.sh, as task 115 fixed its exit): the x64 :0 sitting at H6 on 0.4.2, its steps in
# order, each exactly as gate.mjs print gave it (zero-commands<suffix>.txt): the sitting launcher (sitting.mjs) around
# run71.sh under wrap71 (task 50's guards), but without the printed command's own leading `locked.sh task123-x64`,
# because the whole sitting runs inside one hold of the host lock (sitting-locked.sh, CUA_LOCK_MAX set for the sitting),
# so no other holder runs between its steps; a nested locked.sh would wait on the lock this hold already has.
# Each step: refused while hold-sittings exists; refused past the hard stop (HARD_STOP, epoch seconds) when its estimate
# does not fit; task 59's Mozilla Firefox first on PATH, a Firefox step refused unless PATH resolves firefox to it; capped
# at 55 minutes. After each step: its guard records and the all-clear. If hold-sittings exists after a step (the
# launcher wrote it: the all-clear failed), every later :0 step is stopped.
# The launcher exits with the first failing step's status once its steps are done, and with its own codes when it stops.
# usage: sitting.sh <suffix> <out root> <label dir suffix> <step:minutes>...
set -u
D=${CUA171_DIR:-/Users/new/.local/share/cua-171}
T=$D/task123
suffix=$1; OUTROOT=$2; LABEL=$3; shift 3
CMDS=$T/zero-commands$suffix.txt
LOCKED="$D/locked.sh task123-x64 "
mkdir -p "$OUTROOT"
zl() { echo "$(date -u +%FT%TZ) $*" | tee -a "$OUTROOT/zero.log"; }
export PATH=$D/task59/bin:$PATH
zl "sitting start ($*), hard stop $(date -u -d @"${HARD_STOP:?}" +%FT%TZ), firefox $(command -v firefox)"
failed=0
for item in "$@"; do
  step=${item%%:*}; est=${item#*:}
  [ -e "$D/hold-sittings" ] && { zl "hold-sittings present: $step not started; sitting stopped"; exit 5; }
  now=$(date +%s)
  [ $(( now + est * 60 )) -le "$HARD_STOP" ] || { zl "$step's ${est} min do not fit before the hard stop: sitting stopped"; exit 7; }
  cmd=$(awk -v s="== $step" '$0 == s {getline; print; exit}' "$CMDS")
  [ -n "$cmd" ] || { zl "no command for $step in $CMDS"; exit 2; }
  case "$cmd" in "$LOCKED"*) cmd=${cmd#"$LOCKED"} ;; *) zl "$step's command does not start with $LOCKED: refused"; exit 2 ;; esac
  ff=$(command -v firefox)
  if grep -q firefox <<<"$cmd" && [ "$ff" != "$D/task59/bin/firefox" ]; then
    zl "refused: $step drives Firefox, and PATH resolves firefox to $ff"; exit 6
  fi
  O=$OUTROOT/$step.$LABEL
  zl "start $step load=$(cut -d' ' -f1-3 /proc/loadavg)"
  eval "timeout -s TERM -k 120 55m $cmd" > "$T/zero-$step$suffix.out" 2>&1
  code=$?
  zl "end $step exit $code load=$(cut -d' ' -f1-3 /proc/loadavg)"
  [ "$code" -ne 0 ] && [ "$failed" -eq 0 ] && failed=$code
  {
    echo "--- $step exit $code"
    echo "--- owner-baseline"; cat "$O/owner-baseline.txt" 2>/dev/null
    echo "--- pointer"; cat "$O/pointer.txt" 2>/dev/null
    echo "--- wrap.out tail"; tail -6 "$O/wrap.out" 2>/dev/null
    echo "--- all-clear"; cat "$O/all-clear.txt" 2>/dev/null
  } >> "$T/zero-$step$suffix.out"
  [ -e "$D/hold-sittings" ] && { zl "hold-sittings written after $step: every later :0 step stopped"; exit 8; }
done
if [ "$failed" -ne 0 ]; then
  zl "sitting done, a step failed: exit $failed"
  exit "$failed"
fi
zl "sitting done"
