#!/bin/bash
# task 88: one private pilot step of this round, on the pinned engine of this round's run home, as a development run on
# the pinned release (gate.mjs run <step> --pinned <home> --pilot 1, no --dev: the pinned rule inside the step), never
# counted. Refused while hold-sittings exists or stress-ng runs; under the host lock, capped at 45 minutes.
# usage: pilot.sh <step> [extra gate.mjs args]
set -u
D=/Users/new/.local/share/cua-171
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/agent-a458977939f1feb0d
P=$D/m5-t4r2
ACC=$P/home
OUT=$P/out
step=$1; shift
mkdir -p "$OUT"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$OUT/pilot.log"; }
[ -e "$D/hold-sittings" ] && { log "hold-sittings present: $step not started"; exit 3; }
pgrep -x stress-ng > /dev/null && { log "stress-ng running: $step not started"; exit 3; }
log "start $step load=$(cut -d' ' -f1-3 /proc/loadavg) head=$(git -C "$G" rev-parse --short HEAD)"
"$D/locked.sh" m5-t4r2 timeout -s TERM -k 120 45m node "$G/scripts/linux-engine-gate/gate.mjs" run "$step" --pinned "$ACC" --out "$OUT" --pilot 1 --holder m5-t4r2 "$@" > "$OUT/$step.driver.out" 2>&1
code=$?
log "end $step exit $code $(tail -1 "$OUT/$step.driver.out" | cut -c1-200)"
exit $code
