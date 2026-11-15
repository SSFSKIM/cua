#!/bin/bash
# task 88 fix wave 1: the live reruns the fixes touch, at the head, each a pilot on the pinned engine (a development run
# on the pinned release, never counted), under the host lock, capped at 45 minutes, private displays only.
#   - a planted leftover the start check can prove is the harness's own (its marker, its run gone, mode 700, no process
#     naming it), made by this task, so the step's start check is seen clearing one live;
#   - ES: the start check, the end check and the unclean-end record on a private step (items 2, 3's finalizer, 7);
#   - R4: a pinned pilot through a suite's own home, the pinned rule enforced there (item 1).
set -u
D=/Users/new/.local/share/cua-171
P=$D/m5-t4r2
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/agent-a458977939f1feb0d
OUT=$P/out3
mkdir -p "$OUT"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$OUT/pilot.log"; }
[ -e "$D/hold-sittings" ] && { log "hold-sittings present: nothing started"; exit 3; }
pgrep -x stress-ng > /dev/null && { log "stress-ng running: nothing started"; exit 3; }
true & gone=$!; wait $gone
L=/tmp/cua171-run-T88fix
mkdir -m 700 "$L" "$L/session"
printf '{"schema":1,"run":"task88-planted","nonce":"t88","pid":%s,"pid_start":"1","created":"2026-11-15T00:00:00.000Z"}\n' "$gone" > "$L/cua171-run.json"
log "planted $L (marker pid $gone, gone)"
for step in ES R4; do
  log "start $step load=$(cut -d' ' -f1-3 /proc/loadavg) head=$(git -C "$G" rev-parse --short HEAD)"
  "$D/locked.sh" m5-t4r2 timeout -s TERM -k 120 45m node "$G/scripts/linux-engine-gate/gate.mjs" run "$step" --pinned "$P/home" --out "$OUT" --pilot 1 --holder m5-t4r2 > "$OUT/$step.driver.out" 2>&1
  log "end $step exit $? $(tail -1 "$OUT/$step.driver.out" | cut -c1-200)"
done
log "planted leftover after: $([ -e "$L" ] && echo 'still there' || echo 'cleared')"
node "$G/scripts/linux-engine-gate/gate.mjs" summary --out "$OUT" > "$OUT/summary.md"
log "live done"
