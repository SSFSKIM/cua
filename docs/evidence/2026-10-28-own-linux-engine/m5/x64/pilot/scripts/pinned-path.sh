#!/bin/bash
# Task 87: pilots of the pinned path (the controller's word, 2026-11-15): the runs that take T1's pinned rule inside a
# step, which a `--dev --pilot` step never does. Labelled "acceptance on the pinned release" by the harness, but they are
# PILOTS OF THE PINNED PATH at 01ff0648, never counted and never T5's: they live only in the pilot's out root.
#   C1 and R4: gate.mjs run <step> --pinned <run home> with no --dev, each its whole (short) form
#     (withExperimentCandidate's pinned branch and pinnedEngine for C1; suites.sh's counted pinned_check for R4).
#   engine-stop: no gate step runs `--experiment engine-stop`, so its pinned `cua serve` (pinnedServeEnvironment) is
#     reached by the harness directly, `--pinned`, its smallest form: the drain lane, paths eof and signal, the hold
#     case, 2 runs each, on a private X server it starts itself.
# Each under the host lock (holder t87-pilot), capped at 45 minutes; hold-sittings and stress-ng checked before each.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task87/x64
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t87-pilot
ACC=$D/m5/pilot-x64/home
OUT=$D/m5/pilot-x64/out
cd "$G" || exit 2
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$OUT/pinned-path.log"; }
ready() {
  while [ -e "$D/hold-sittings" ]; do log "hold-sittings present: waiting before $1"; sleep 60; done
  while pgrep -x stress-ng > /dev/null; do log "stress-ng running: waiting before $1"; sleep 30; done
}
for step in C1 R4; do
  ready "$step"
  log "start $step (pinned, no --dev)"
  "$D/locked.sh" t87-pilot timeout -s TERM -k 120 45m "$T/g.sh" run "$step" --pinned "$ACC" --out "$OUT" > "$OUT/$step.pinned.driver.out" 2>&1
  log "end $step exit $? $(tail -1 "$OUT/$step.pinned.driver.out" | cut -c1-200)"
done
ready engine-stop
E=$OUT/engine-stop.pinned-path-pilot
mkdir -p "$E"
echo "acceptance on the pinned release (harness label); a pilot of the pinned path at 01ff0648, not counted, not T5's" > "$E/LABEL"
log "start engine-stop (pinned)"
"$D/locked.sh" t87-pilot timeout -s TERM -k 120 45m env -u DISPLAY -u XAUTHORITY -u CUA_LINUX_ENGINE_BIN CUA_HOME="$ACC" \
  node "$G/scripts/linux-engine-diff.mjs" --experiment engine-stop --cua "$ACC/engine/linux/cua-engine" --pinned \
  --control-root "$G" --lanes drain --paths eof,signal --cases hold --trials 2 --run pinned-engine-stop-pilot --out "$E/run" \
  > "$E/stdout.log" 2> "$E/stderr.log"
log "end engine-stop exit $? $(tail -1 "$E/stdout.log" | cut -c1-200)"
