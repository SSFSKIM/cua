#!/bin/bash
# Task 136 (from task 122's h7.sh): counted private steps at H8 = 048140a2 on the pinned 0.4.3 home home-arm64-043,
# in the order given, each once. For each: hold-sittings and the disk (ruling 937) checked, then the step's line as
# `gate.mjs print` gives it (holder h8-arm64, out m5/out-arm64-h8), its print's record kept apart (print writes the
# step's record directory, which `run` would refuse), run with step.sh's quiet wait (up to 6 minutes for no stress-ng and
# a 1-minute load below 1.0) inside the printed line's own hold, the printed gate command unchanged. It stops at the
# first step that exits nonzero: nothing is rerun.
# usage: steps.sh <step>...
set -u
D=/Users/new/.local/share/cua-171
T=$D/task136
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t136-h8
ACC=$D/m5/home-arm64-043
OUT=$D/m5/out-arm64-h8
L="$D/locked.sh h8-arm64"
mkdir -p "$OUT"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$OUT/steps.log"; }
export PATH=$D/node24/bin:$PATH
QUIET='s=$(date +%s); while [ $(( $(date +%s) - s )) -lt 360 ]; do if ! pgrep -x stress-ng > /dev/null && awk -v l="$(cut -d" " -f1 /proc/loadavg)" "BEGIN{exit !(l < 1.0)}"; then break; fi; sleep 10; done; echo "quiet wait $(( $(date +%s) - s )) s: load $(cut -d" " -f1-3 /proc/loadavg) stress-ng $(pgrep -c -x stress-ng)"'
for step in "$@"; do
  [ -e "$D/hold-sittings" ] && { log "hold-sittings present: $step not started"; exit 5; }
  f=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
  [ "$f" -le 20 ] && { log "disk: ${f}G free, 20G or less (ruling 937): $step not started"; exit 9; }
  [ -e "$OUT/$step.pinned-release" ] && { log "$OUT/$step.pinned-release exists: not started"; exit 2; }
  node "$G/scripts/linux-engine-gate/gate.mjs" print "$step" --pinned "$ACC" --out "$OUT" --holder h8-arm64 > "$OUT/$step.print.txt" 2>&1 || { log "print $step failed"; exit 1; }
  [ -e "$OUT/$step.pinned-release" ] && mv "$OUT/$step.pinned-release" "$OUT/$step.print-record"
  cmd=$(tail -1 "$OUT/$step.print.txt")
  case "$cmd" in "$L "*) gate=${cmd#"$L "} ;; *) log "$step's printed line does not start with the lock: refused"; exit 2 ;; esac
  log "run $step (df / ${f}G, load $(cut -d' ' -f1-3 /proc/loadavg)) as printed: $cmd"
  CUA_LOCK_MAX=56m $L bash -c "$QUIET; [ -e $D/hold-sittings ] && { echo hold-sittings present; exit 5; }; exec $gate" > "$OUT/$step.driver.out" 2>&1
  c=$?
  log "end $step exit $c load=$(cut -d' ' -f1-3 /proc/loadavg) $(grep -m1 '^quiet wait' "$OUT/$step.driver.out")"
  [ "$c" = 0 ] || { log "FAILED $step (exit $c): stopped for the controller"; exit 1; }
done
log "steps done: $*"
