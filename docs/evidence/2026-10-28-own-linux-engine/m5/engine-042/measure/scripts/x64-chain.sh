#!/bin/bash
# Task 116 on x64: the linux-engine 0.4.2 candidate (3dd381ec, B = 450 by default) measured on private displays only.
# Every run a development run on a private display of its own (private-run.mjs: Xvfb -displayfd, never :0), under the
# host lock (holder m5-measure042, 45 min cap), hold-sittings checked before each; a run that fails is logged and the
# chain goes on (each run's verdict stands alone). An existing run directory is skipped.
# usage: x64-chain.sh <candidate engine> <part>...
#   v5-<load>-<k>    V5's two cells (chrome_dnd_shared, chrome_dnd_short_in_front_shared), the candidate alone, BLOCKS
#                    blocks (26 by default), load factor 0 (idle) or 2
#   d1-<load>-<k>    D1, the drag experiment's Chrome cells; d2: Electron's. Every cua lane with --engine-stats (each
#                    engine's --stats lines in run/engine-stats/), so each drag's hold record and its pings are kept.
#                    At load 2 the harness's own load (--load-factor 2, 40 drags a side), lanes pinned and cua; idle,
#                    lanes pinned, newest and cua (the cost cells, judged as D1 and D2 judge them)
set -u
D=/Users/new/.local/share/cua-171
T=$D/task116
export CHECKOUT=/Users/new/Developer/GitHub/cua/.claude/worktrees/agent-ae5bb3b56e0e54cba
export VENDOR=$D/m5/home-x64-041/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
export NEWEST=$D/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
NODE=/usr/bin/node
CAND=$1; shift
BLOCKS=${BLOCKS:-26}
OUT=${OUTDIR:-$T/x64}
mkdir -p "$OUT"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$OUT/chain.log"; }
run() {
  local name=$1; shift
  [ -e "$D/hold-sittings" ] && { log "hold-sittings present: $name not started; chain stopped"; exit 5; }
  [ -e "$OUT/$name" ] && { log "$name exists: skipped"; return; }
  log "start $name load=$(cut -d' ' -f1-3 /proc/loadavg)"
  "$@" > "$OUT/$name.out" 2>&1
  log "end $name exit $? load=$(cut -d' ' -f1-3 /proc/loadavg)"
}
locked() { "$D/locked.sh" m5-measure042 timeout -s TERM -k 60 45m "$@"; }
# a part whose kind ends in n (v5n-, d1n-) adds the sampler-off lane `cua:nopings` (OFF_FLAG, the fix wave's flag that
# turns the hold's pings off; ruling 892's proof that the sampler does not move the release)
for part in "$@"; do
  spec=${part#*-}; load=${spec%-*}; kind=${part%%-*}
  off=()
  case $kind in v5n|d1n|d2n) : "${OFF_FLAG:?a sampler-off part needs OFF_FLAG}"; off=(--variant "nopings=$OFF_FLAG") ;; esac
  case $part in
    v5-*|v5n-*)
      la=(); [ "$load" != 0 ] && la=(--load-factor "$load")
      run "$part" locked "$NODE" "$T/scripts/private-run.mjs" "$CHECKOUT" "$OUT/$part" "task 116 development run" "${la[@]}" -- \
        --vendor "$VENDOR" --newest "$NEWEST" --cua "$CAND" --scene device-chrome-dnd \
        --ops chrome_dnd_shared,chrome_dnd_short_in_front_shared --blocks "$BLOCKS" --run "m5m042-$part" \
        --ballast gate --dev --no-audit "${off[@]}" ;;
    # sel-<load>-<k>: V5's scene's own no-take control, a select drag in front on the same page with the same ballast
    # (chrome_select_nudged_shared, its stray nudges its condition), the candidate alone, BLOCKS blocks
    sel-*)
      la=(); [ "$load" != 0 ] && la=(--load-factor "$load")
      run "$part" locked "$NODE" "$T/scripts/private-run.mjs" "$CHECKOUT" "$OUT/$part" "task 116 development run" "${la[@]}" -- \
        --vendor "$VENDOR" --newest "$NEWEST" --cua "$CAND" --scene device-chrome-dnd --ops chrome_select_nudged_shared \
        --ballast gate --dev --no-audit --blocks "$BLOCKS" --run "m5m042-$part" ;;
    # edn-<load>-<k>: Electron's draggable source with a short path (the dnd experiment's --dnd-short, in front), so the
    # hold runs and its pings are sampled on a press that takes; the lane asks --stats itself (`cua:st`), 30 drags
    edn-*)
      la=(); [ "$load" != 0 ] && la=(--load-factor "$load")
      run "$part" locked "$NODE" "$T/scripts/private-run.mjs" "$CHECKOUT" "$OUT/$part" "task 116 development run" -- \
        --experiment dnd --family electron --dnd-short --vendor "$VENDOR" --newest "$NEWEST" --cua "$CAND" \
        --lanes cua:st --variant "st=--stats" --trials 30 --run "m5m042-$part" "${la[@]}" ;;
    d1-*|d2-*|d1n-*|d2n-*)
      fam=chrome; [ "${kind%n}" = d2 ] && fam=electron
      if [ "$load" != 0 ]; then la=(--load-factor "$load"); lanes=pinned,cua; else la=(); lanes=pinned,newest,cua; fi
      [ ${#off[@]} -gt 0 ] && lanes=$lanes,cua:nopings
      run "$part" locked "$NODE" "$T/scripts/private-run.mjs" "$CHECKOUT" "$OUT/$part" "task 116 development run" -- \
        --experiment drag --vendor "$VENDOR" --newest "$NEWEST" --occlusion visible --family "$fam" --cua "$CAND" \
        --run "m5m042-$part" --lanes "$lanes" --engine-stats ${OPS:+--ops "$OPS"} "${la[@]}" "${off[@]}" ;;
    *) log "unknown part $part"; exit 2 ;;
  esac
done
log "chain done"
