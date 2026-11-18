#!/bin/bash
# Task 101: the candidate's development measurement on a VM, one run after another, each its own locked hold (holder
# m5-engine041), each capped at 45 minutes: the gate's own steps through gate.mjs as task 96 and task 98 ran them
# (--dev --pilot 100) on the candidate's release build. A STOP file in the out root stops it before the next run, and
# so does hold-sittings. usage: chain.sh <sha> <step>...   (T101_CHECKOUT: an existing checkout, used as it is)
set -u
D=/Users/new/.local/share/cua-171
T=$D/task101
SHA=$1; shift
G=${T101_CHECKOUT:-/Users/new/Developer/GitHub/cua/.claude/worktrees/t101-041}
BIN=$G/native/linux-engine/target/release/cua-engine
OUT=${T101_OUT:-$T/out}
[ -x "$D/node24/bin/node" ] && export PATH=$D/node24/bin:$PATH
mkdir -p "$OUT"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$OUT/driver.log"; }
stopped() {
  [ -e "$OUT/STOP" ] && { log "STOP file present: stopping before $1"; exit 3; }
  [ -e "$D/hold-sittings" ] && { log "hold-sittings present: stopping before $1"; exit 5; }
  return 0
}
stopped setup
"$D/locked.sh" m5-engine041 timeout -s TERM -k 120 40m "$T/bin/setup.sh" "$SHA" > "$OUT/setup-$SHA.log" 2>&1 || { log "setup at $SHA failed"; exit 6; }
log "checkout $G at $(git -C "$G" rev-parse HEAD), engine $("$BIN" --version), sha256 $(sha256sum "$BIN" | cut -d' ' -f1)"
for step in "$@"; do
  stopped "$step"
  log "start gate $step --candidate $BIN --dev --pilot 100 loadavg=$(cut -d' ' -f1-3 /proc/loadavg)"
  "$D/locked.sh" m5-engine041 timeout -s TERM -k 120 45m node "$G/scripts/linux-engine-gate/gate.mjs" run "$step" --candidate "$BIN" --dev --pilot 100 --out "$OUT/gate" --holder m5-engine041 > "$OUT/gate-$step.driver.out" 2>&1
  log "end gate $step exit $? loadavg=$(cut -d' ' -f1-3 /proc/loadavg) $(tail -1 "$OUT/gate-$step.driver.out" | cut -c1-200)"
done
log "chain done: $*"
