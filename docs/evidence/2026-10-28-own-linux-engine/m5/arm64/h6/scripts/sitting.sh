#!/bin/bash
# Task 122 (from task 109's and task 99's sitting.sh, from task 96's and task 89's): an arm64 :0 sitting, its steps in order, each
# exactly as gate.mjs print gave it (zero-commands<suffix>.txt): the sitting launcher (sitting.mjs) around run71.sh
# under M5's wrap71 copy (task 50's guards), without the printed command's own leading `locked.sh task122-arm64`,
# because the whole sitting runs inside one hold of the host lock (sitting-locked.sh, CUA_LOCK_MAX set for the sitting);
# a nested locked.sh would wait on the lock this hold already has. The arm64 :0 is nobody's display (pre-flight §1.1;
# ruling 803): no GO, no announcement, the same guards. The run's Node 24.22.1 first on PATH; CHROME_BIN, when set, a
# google-chrome wrapper's directory put first (F2's current stable), its `google-chrome --version` logged per step.
# Each step: refused while hold-sittings exists; refused past the hard stop (HARD_STOP, epoch seconds) when its estimate
# does not fit; task 59's Mozilla Firefox first on PATH, a Firefox step refused unless PATH resolves firefox to it; capped
# at 55 minutes. After each step: its guard records and the all-clear, then after-step.sh (kept traces, rejudge-audit,
# settle-check). If hold-sittings exists after a step (the launcher wrote it: the all-clear failed), every later :0
# step is stopped.
# The launcher exits with the first failing step's status once its steps are done (ruling 888.6, #171 M5 task 115:
# it exited 0 after a failing step, so a chain gated on it ran on past a FAIL), and with its own codes when it stops.
# CUA171_DIR names another root than ~/.local/share/cua-171 (the launcher's own test, task 115's sitting-test.sh).
# usage: sitting.sh <suffix> <out root> <label dir suffix> <step:minutes>...
set -u
D=${CUA171_DIR:-/Users/new/.local/share/cua-171}
T=$D/task122
suffix=$1; OUTROOT=$2; LABEL=$3; shift 3
CMDS=$T/zero-commands$suffix.txt
LOCKED="$D/locked.sh task122-arm64 "
mkdir -p "$OUTROOT"
zl() { echo "$(date -u +%FT%TZ) $*" | tee -a "$OUTROOT/zero.log"; }
export PATH=$D/task59/bin:$D/node24/bin:$PATH
[ -n "${CHROME_BIN:-}" ] && export PATH=$CHROME_BIN:$PATH
zl "sitting start ($*), hard stop $(date -u -d @"${HARD_STOP:?}" +%FT%TZ), firefox $(command -v firefox), node $(command -v node) $(node --version), google-chrome $(command -v google-chrome)"
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
  zl "start $step load=$(cut -d' ' -f1-3 /proc/loadavg) PATH=$(echo "$PATH" | cut -d: -f1-3) chrome=[$(google-chrome --version 2>&1 | head -1)]"
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
  "$T/after-step.sh" "$O" "$T/after-$step$suffix.txt"
  zl "after $step: $(grep -E '^audit rows|^rejudge:|^kept-traces exit' "$T/after-$step$suffix.txt" | tr '\n' ';') settle: $(grep -oE '(TAKEN|not taken|unknown)' "$T/after-$step$suffix.txt" | sort | uniq -c | tr -s ' \n' ' ')"
  [ -e "$D/hold-sittings" ] && { zl "hold-sittings written after $step: every later :0 step stopped"; exit 8; }
done
if [ "$failed" -ne 0 ]; then
  zl "sitting done, a step failed: exit $failed"
  exit "$failed"
fi
zl "sitting done"
