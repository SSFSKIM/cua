#!/bin/bash
# Task 5's run (#228 T5): the acceptance through the confined service, in one environment of
# scripts/accept/linux-runtime-env.sh (a private display, never :0; a session bus and an accessibility bus of the run's
# own; fresh homes). Under the host lock:
#   locked.sh t183 timeout -s TERM -k 60 40m run.sh <run dir> <out dir> <head checkout> <base checkout> <electron> <engine 0.4.6> <engine 0.4.7>
# The stage below runs inside the environment (run.sh --inside ...).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd -P)"

if [ "${1:-}" = --inside ]; then
  shift
  out="$1" head="$2" base="$3" electron="$4" e046="$5" e047="$6" run="$7"
  log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$out/steps.log"; }
  log "display $DISPLAY; CUA_HOME $CUA_HOME; HOME $HOME"
  # The homes: the candidate's in CUA_HOME (the environment's), the base's beside it; each its checkout's own install.
  log "install the candidate (head $(git -C "$head" rev-parse --short=12 HEAD))"
  node "$head/bin/cua.mjs" install --engine --json > "$out/install-candidate.json"
  log "install the base (main $(git -C "$base" rev-parse --short=12 HEAD))"
  CUA_HOME="$run/base-home" node "$base/bin/cua.mjs" install --engine --json > "$out/install-base.json"
  node "$head/bin/cua.mjs" doctor --json > "$out/doctor-candidate.json" || true
  CUA_HOME="$run/base-home" node "$base/bin/cua.mjs" doctor --json > "$out/doctor-base.json" || true
  # The override names a copy of 0.4.6 inside the run.
  mkdir -p "$run/engine-046"
  cp "$e046" "$run/engine-046/cua-engine"
  chmod 755 "$run/engine-046/cua-engine"
  status=0
  log "direct: the screenshot's request to 0.4.6 and 0.4.7"
  node "$here/engine-direct.mjs" "$run/engine-046/cua-engine" "$e047" > "$out/engine-direct.jsonl" || status=1
  log "candidate: live1 live3 screenshot gedit"
  node "$head/scripts/accept/linux-electron-a11y.mjs" --out "$out/candidate.json" --cli "$head/bin/cua.mjs" --electron "$electron" \
    --base-cli "$base/bin/cua.mjs" --base-home "$run/base-home" | tee -a "$out/steps.log" || true
  log "base control: live1 live3 screenshot (main, engine 0.4.6)"
  CUA_HOME="$run/base-home" node "$head/scripts/accept/linux-electron-a11y.mjs" --out "$out/base-control.json" --cli "$base/bin/cua.mjs" \
    --electron "$electron" --scenarios live1,live3,screenshot | tee -a "$out/steps.log" || true
  log "override control: live1 with CUA_LINUX_ENGINE_BIN naming 0.4.6"
  CUA_LINUX_ENGINE_BIN="$run/engine-046/cua-engine" node "$head/scripts/accept/linux-electron-a11y.mjs" --out "$out/override-control.json" \
    --cli "$head/bin/cua.mjs" --electron "$electron" --scenarios live1 | tee -a "$out/steps.log" || true
  log "verdict"
  node "$here/judge.mjs" "$out" "$run/engine-046/cua-engine" "$head" > "$out/verdict.json" || status=1
  log "verdict $(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1])).status)' "$out/verdict.json") (exit $status)"
  exit "$status"
fi

[ $# -eq 7 ] || { echo "usage: run.sh <run dir> <out dir> <head> <base> <electron> <engine 0.4.6> <engine 0.4.7>" >&2; exit 2; }
run="$1" out="$2" head="$3" base="$4" electron="$5" e046="$6" e047="$7"
mkdir -p "$out" "$run"
: > "$out/steps.log"
exec "$head/scripts/accept/linux-runtime-env.sh" "$run" -- "$0" --inside "$out" "$head" "$base" "$electron" "$e046" "$e047" "$(cd "$run" && pwd -P)"
