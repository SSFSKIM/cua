#!/bin/bash
# Task 98: the arm64 measurement runs after cold1, one after another, each its own locked hold (holder m5-l4a), each
# capped at 45 minutes, each after the host is quiet again: the pinned engine itself on the cold plan (a copy of
# linux-engine-v0.4.0's arm64 asset, its hash checked against the pin's), then L4a's whole plan at twice the load and
# H1 at idle through gate.mjs as task 96 ran them (--pilot 100) on the prototype's build, then the plain drag's cold
# plan. A STOP file in the out root stops it before the next run.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task98
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t98-l4a
BIN=$G/native/linux-engine/target/release/cua-engine
OUT=$T/out
export PATH=$D/node24/bin:$PATH
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$OUT/driver.log"; }
quiet() {
  [ -e "$OUT/STOP" ] && { log "STOP file present: stopping before $1"; exit 3; }
  [ -e "$D/hold-sittings" ] && { log "hold-sittings present: stopping before $1"; exit 5; }
  while pgrep -x stress-ng > /dev/null; do sleep 30; done
  for i in $(seq 1 90); do
    l=$(cut -d' ' -f1 /proc/loadavg)
    awk -v l="$l" 'BEGIN{exit !(l < 1.0)}' && break
    sleep 10
  done
}
gate() {
  quiet "$1"
  log "start gate $1 --candidate $BIN --dev --pilot 100 loadavg=$(cut -d' ' -f1-3 /proc/loadavg)"
  "$D/locked.sh" m5-l4a timeout -s TERM -k 120 45m node "$G/scripts/linux-engine-gate/gate.mjs" run "$1" --candidate "$BIN" --dev --pilot 100 --out "$OUT/gate" --holder m5-l4a > "$OUT/gate-$1.driver.out" 2>&1
  log "end gate $1 exit $? loadavg=$(cut -d' ' -f1-3 /proc/loadavg) $(tail -1 "$OUT/gate-$1.driver.out" | cut -c1-200)"
}
# the pinned engine, copied (task 96's home is read, never run from) and checked against the pin
PINNED=$T/pinned/cua-engine
if [ ! -x "$PINNED" ]; then
  mkdir -p "$T/pinned"
  cp "$D/m5/pilot-arm64/home/engine/linux/cua-engine" "$PINNED"
fi
want=$(node -e 'const p=require(process.argv[1]);console.log(p.assets.arm64.sha256)' "$G/runtime/engine/linux-engine.json")
have=$(sha256sum "$PINNED" | cut -d' ' -f1)
log "pinned copy sha256 $have (the pin's arm64: $want)"
[ "$want" = "$have" ] || { log "the pinned copy is not the pin's asset: stopping"; exit 4; }
for run in "$@"; do
  case "$run" in
    shipped) quiet cold-shipped; "$T/bin/drive98.sh" cold-shipped t98-cold-shipped load2 "$PINNED" ;;
    L4a|H1) gate "$run" ;;
    drag) quiet cold-drag; "$T/bin/drive98.sh" cold-drag t98-cold-drag load2 ;;
    *) log "no run $run" ;;
  esac
done
log "chain done: $*"
