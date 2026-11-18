#!/bin/bash
# Task 98: this task's measurement runs on a VM, one after another, each its own locked hold (holder m5-l4a), each
# capped at 45 minutes, each after the host is quiet again. First the checkout is brought to the commit given (the
# harness's plans; the engine build follows it). Runs, by name:
#   cold<N>   the balanced cold plan (t98-cold) at twice the load on the prototype's build;
#   shipped   the same order on linux-engine-v0.4.0 itself (a copy of the pinned asset of this architecture, its hash
#             checked against the pin's; task 96's home is read, never run from);
#   L4a, H1   the gate's own steps through gate.mjs as task 96 ran them (--pilot 100) on the prototype's build;
#   drag<N>   the plain drag's cold plan (t98-cold-drag) at twice the load;
#   chrome    Chrome's drops on the prototype's build (t14-floor, 10 a cell, idle): the path the fix must not move.
# A STOP file in the out root stops it before the next run. usage: chain2.sh <sha> <run>...
set -u
D=/Users/new/.local/share/cua-171
T=$D/task98
SHA=$1; shift
G=${T98_CHECKOUT:-/Users/new/Developer/GitHub/cua/.claude/worktrees/t98-l4a}
BIN=$G/native/linux-engine/target/release/cua-engine
OUT=$T/out
[ -x "$D/node24/bin/node" ] && export PATH=$D/node24/bin:$PATH
mkdir -p "$OUT"
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
if [ -z "${T98_CHECKOUT:-}" ]; then
  [ -e "$D/hold-sittings" ] && { log "hold-sittings present: no setup"; exit 5; }
  "$D/locked.sh" m5-l4a timeout -s TERM -k 120 40m "$T/bin/setup.sh" "$SHA" > "$OUT/setup-$SHA.log" 2>&1 || { log "setup at $SHA failed"; exit 6; }
fi
log "checkout $G at $(git -C "$G" rev-parse HEAD), engine $("$BIN" --version)"
for run in "$@"; do
  case "$run" in
    cold*) quiet "$run"; "$T/bin/drive98.sh" "$run" t98-cold load2 ;;
    drag*) quiet "$run"; "$T/bin/drive98.sh" "$run" t98-cold-drag load2 ;;
    shipped)
      PINNED=$T/pinned/cua-engine
      SRC=${T98_PINNED_SRC:-$D/m5/pilot-arm64/home/engine/linux/cua-engine}
      [ -x "$PINNED" ] || { mkdir -p "$T/pinned"; cp "$SRC" "$PINNED"; }
      arch=$(uname -m); [ "$arch" = aarch64 ] && arch=arm64; [ "$arch" = x86_64 ] && arch=x64
      want=$(node -e 'const p=require(process.argv[1]);console.log(p.assets[process.argv[2]].sha256)' "$G/runtime/engine/linux-engine.json" "$arch")
      have=$(sha256sum "$PINNED" | cut -d' ' -f1)
      log "pinned copy sha256 $have (the pin's $arch: $want)"
      [ "$want" = "$have" ] || { log "the pinned copy is not the pin's asset: skipped"; continue; }
      quiet shipped; "$T/bin/drive98.sh" shipped t98-cold-shipped load2 "$PINNED" ;;
    L4a|H1) gate "$run" ;;
    chrome) quiet chrome; T98_FAMILY=chrome "$T/bin/drive98.sh" chrome-floor t14-floor idle "" --trials 10 ;;
    *) log "no run $run" ;;
  esac
done
log "chain done: $*"
