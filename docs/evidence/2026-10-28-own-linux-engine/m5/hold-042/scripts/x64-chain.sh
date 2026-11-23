#!/bin/bash
# Task 113 on x64: V5's two cells on the released 0.4.1 (the baseline rate), idle and at twice the load, then the cost
# cells (D1 Chrome, D2 Electron) with the candidate's lanes. Every run a development run on a private display of its
# own, each under the host lock (holder m5-hold042, 45 min cap), hold-sittings checked before each. A run that fails
# is logged and the chain goes on: each run's verdict stands alone.
# usage: x64-chain.sh <candidate engine> [part...]   parts: v5 cost (both by default)
set -u
T=/Users/new/.local/share/cua-171/task113
D=/Users/new/.local/share/cua-171
export CHECKOUT=/Users/new/Developer/GitHub/cua/.claude/worktrees/agent-ae4c2142e66e0c56a
export VENDOR=$D/m5/home-x64-041/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
export NEWEST=$D/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
BASE=$D/m5/home-x64-041/engine/linux/cua-engine
CAND=$1; shift
PARTS=${*:-v5 cost}
OUT=$T/x64
mkdir -p "$OUT"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$OUT/chain.log"; }
P() { echo "p$1=--drag-dnd-final-hold-from press --drag-dnd-final-hold-ms $1"; }
R() { echo "r$1=--drag-dnd-final-hold-ms $1"; }
run() {
  local name=$1; shift
  [ -e "$D/hold-sittings" ] && { log "hold-sittings present: $name not started; chain stopped"; exit 5; }
  log "start $name load=$(cut -d' ' -f1-3 /proc/loadavg)"
  "$@" > "$OUT/$name.out" 2>&1
  log "end $name exit $? load=$(cut -d' ' -f1-3 /proc/loadavg)"
}
drag() {
  local name=$1 family=$2 lanes=$3; shift 3
  run "$name" "$D/locked.sh" m5-hold042 timeout -s TERM -k 60 45m /usr/bin/node "$T/scripts/private-run.mjs" "$CHECKOUT" "$OUT/$name" "task 113 development run" -- \
    --experiment drag --vendor "$VENDOR" --newest "$NEWEST" --occlusion visible --family "$family" --cua "$CAND" \
    --run "m5h042-$name" --lanes "$lanes" "$@"
}
for part in $PARTS; do
  case $part in
    # v5-<load>-<k>: one baseline run (26 blocks) on the released 0.4.1; an existing one is skipped
    v5-*)
      spec=${part#v5-}; load=${spec%-*}; k=${spec#*-}
      if [ -e "$OUT/v5-base-l$load-$k" ]; then log "v5-base-l$load-$k exists: skipped"; continue; fi
      run "v5-base-l$load-$k" "$T/scripts/v5cells.sh" "$OUT/v5-base-l$load-$k" 26 "$load" "$BASE" --no-audit ;;
    # the lanes the controller kept (cua with the hold off, p300, p350, r150), two beside the vendors a run
    cost)
      for fam in chrome electron; do
        drag "cost-$fam-a" "$fam" pinned,newest,cua,cua:p300 --variant "$(P 300)"
        drag "cost-$fam-b" "$fam" pinned,newest,cua:p350,cua:r150 --variant "$(P 350)" --variant "$(R 150)"
      done ;;
    *) log "unknown part $part"; exit 2 ;;
  esac
done
log "chain done"
