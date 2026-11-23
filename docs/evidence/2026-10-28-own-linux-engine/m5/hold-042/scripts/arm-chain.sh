#!/bin/bash
# Task 113 on arm64: V5's two cells with the candidate's lanes (cua with the hold off, p300, p350, r150), idle on :0
# through the sitting launcher with every guard (sitting.mjs, run71.sh under wrap71.py; arm64's :0 is nobody's display)
# and at twice the load on a private display (private-run.mjs; run71.sh refuses a running load), then the cost cells
# (D1 Chrome, D2 Electron) on private displays. Each run a development run under locked.sh m5-hold042 with a 45 min
# cap, hold-sittings checked before each; a run that fails is logged and the chain goes on.
# usage: arm-chain.sh <candidate engine> <part>...   parts: zero-<k> (idle, :0), load-<k> (2x, private), cost
set -u
D=/Users/new/.local/share/cua-171
T=$D/task113
CHECKOUT=/Users/new/Developer/GitHub/cua/.claude/worktrees/t113-hold042
NODE=$D/node24/bin/node
VENDOR=$D/m5/home-arm64-041/runtimes/26.928.40906-linux-arm64/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_arm64
NEWEST=$D/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_arm64
CAND=$1; shift
BLOCKS=${BLOCKS:-12}
OUT=$T/arm64
mkdir -p "$OUT"
export PATH=$D/node24/bin:$PATH
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$OUT/chain.log"; }
LANES=(--variant "p300=--drag-dnd-final-hold-from press --drag-dnd-final-hold-ms 300"
       --variant "p350=--drag-dnd-final-hold-from press --drag-dnd-final-hold-ms 350"
       --variant "r150=--drag-dnd-final-hold-ms 150")
BASE=$D/m5/home-arm64-041/engine/linux/cua-engine
CELLS0=(--vendor "$VENDOR" --newest "$NEWEST" --scene device-chrome-dnd
        --ops chrome_dnd_shared,chrome_dnd_short_in_front_shared --ballast gate --dev --no-audit)
CELLS=("${CELLS0[@]}" --cua "$CAND" "${LANES[@]}")
run() {
  local name=$1; shift
  [ -e "$D/hold-sittings" ] && { log "hold-sittings present: $name not started; chain stopped"; exit 5; }
  [ -e "$OUT/$name" ] && { log "$name exists: skipped"; return; }
  log "start $name load=$(cut -d' ' -f1-3 /proc/loadavg)"
  "$@" > "$OUT/$name.out" 2>&1
  log "end $name exit $? load=$(cut -d' ' -f1-3 /proc/loadavg)"
}
for part in "$@"; do
  case $part in
    zero-*)
      name=v5-$part
      run "$name" "$D/locked.sh" m5-hold042 timeout -s TERM -k 60 45m "$NODE" "$CHECKOUT/scripts/linux-engine-gate/sitting.mjs" \
        --dir "$OUT/$name" --hold "$D/hold-sittings" --terminal end -- \
        env WRAP="$CHECKOUT/docs/evidence/2026-10-28-own-linux-engine/m5/guards/wrap71.py" \
        "$CHECKOUT/docs/evidence/2026-10-28-own-linux-engine/m4/pointer-route/scripts/run71.sh" "$OUT/$name" "$CHECKOUT/" \
        "${CELLS[@]}" --blocks "$BLOCKS" --run "m5h042-$name" ;;
    # the released 0.4.1 alone (the pin's arm64 asset), idle, on a private display
    base-*)
      name=v5-$part
      run "$name" "$D/locked.sh" m5-hold042 timeout -s TERM -k 60 45m "$NODE" "$T/scripts/private-run.mjs" "$CHECKOUT" \
        "$OUT/$name" "task 113 development run" -- "${CELLS0[@]}" --cua "$BASE" --blocks "$BLOCKS" --run "m5h042-$name" ;;
    # the candidate's lanes, idle, on a private display
    idle-*)
      name=v5-$part
      run "$name" "$D/locked.sh" m5-hold042 timeout -s TERM -k 60 45m "$NODE" "$T/scripts/private-run.mjs" "$CHECKOUT" \
        "$OUT/$name" "task 113 development run" -- "${CELLS[@]}" --blocks "$BLOCKS" --run "m5h042-$name" ;;
    load-*)
      name=v5-$part
      run "$name" "$D/locked.sh" m5-hold042 timeout -s TERM -k 60 45m "$NODE" "$T/scripts/private-run.mjs" "$CHECKOUT" \
        "$OUT/$name" "task 113 development run" --load-factor 2 -- "${CELLS[@]}" --blocks "$BLOCKS" --run "m5h042-$name" ;;
    cost)
      for fam in chrome electron; do
        for set in a b; do
          case $set in
            a) lanes=pinned,newest,cua,cua:p300; v=("${LANES[0]}" "${LANES[1]}") ;;
            b) lanes=pinned,newest,cua:p350,cua:r150; v=("${LANES[2]}" "${LANES[3]}" "${LANES[4]}" "${LANES[5]}") ;;
          esac
          name=cost-$fam-$set
          run "$name" "$D/locked.sh" m5-hold042 timeout -s TERM -k 60 45m "$NODE" "$T/scripts/private-run.mjs" "$CHECKOUT" \
            "$OUT/$name" "task 113 development run" -- --experiment drag --vendor "$VENDOR" --newest "$NEWEST" \
            --occlusion visible --family "$fam" --cua "$CAND" --run "m5h042-$name" --lanes "$lanes" "${v[@]}"
        done
      done ;;
    *) log "unknown part $part"; exit 2 ;;
  esac
done
log "chain done"
