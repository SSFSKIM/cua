#!/bin/bash
# Task 116 on arm64: the linux-engine 0.4.2 candidate measured. Each run a development run under the host lock (holder
# m5-measure042, 45 min cap), hold-sittings checked before each; a run that fails is logged and the chain goes on, except
# the :0 sitting, whose launcher's stop ends the chain (exit 5, 7 or 8: hold-sittings, the hard stop, a written hold).
# usage: arm-chain.sh <candidate engine> <part>...
#   zero          V5's two cells idle on :0 through task 109's sitting launcher (the fixed copy, ruling 888.6) around
#                 sitting.mjs and run71.sh under wrap71 (every guard), ZBLOCKS blocks (30: 30 cold, 60 warm)
#   v5-<load>-<k> V5's two cells on a private display, the candidate alone, BLOCKS blocks (25), load 0 or 2
#   d1-<load>-<k> D1 (Chrome) or d2 (Electron), --engine-stats; load 2: the harness's own load, lanes pinned and cua;
#                 load 0: lanes pinned, newest and cua (the cost cells)
set -u
D=/Users/new/.local/share/cua-171
T=$D/task116
Z=$D/task109
W=/Users/new/Developer/GitHub/cua/.claude/worktrees/t116-measure042
NODE=$D/node24/bin/node
VENDOR=$D/m5/home-arm64-041/runtimes/26.928.40906-linux-arm64/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_arm64
NEWEST=$D/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_arm64
CAND=$1; shift
BLOCKS=${BLOCKS:-25}
ZBLOCKS=${ZBLOCKS:-30}
OUT=${OUTDIR:-$T/arm64}
mkdir -p "$OUT"
export PATH=$D/node24/bin:$PATH
# CHROME_BIN, when set, a google-chrome wrapper's directory put first (T7's Chrome 158 copy; the held 156 is left alone)
[ -n "${CHROME_BIN:-}" ] && export PATH=$CHROME_BIN:$PATH
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$OUT/chain.log"; }
run() {
  local name=$1; shift
  [ -e "$D/hold-sittings" ] && { log "hold-sittings present: $name not started; chain stopped"; exit 5; }
  [ -e "$OUT/$name" ] && { log "$name exists: skipped"; return 0; }
  log "start $name load=$(cut -d' ' -f1-3 /proc/loadavg)"
  "$@" > "$OUT/$name.out" 2>&1
  local code=$?
  log "end $name exit $code load=$(cut -d' ' -f1-3 /proc/loadavg)"
  return $code
}
locked() { "$D/locked.sh" m5-measure042 timeout -s TERM -k 60 45m "$@"; }
CELLS=(--vendor "$VENDOR" --newest "$NEWEST" --cua "$CAND" --scene device-chrome-dnd
       --ops chrome_dnd_shared,chrome_dnd_short_in_front_shared --ballast gate --dev --no-audit)
# a part whose kind ends in n (v5n-, d1n-) adds the sampler-off lane `cua:nopings` (OFF_FLAG, the fix wave's flag that
# turns the hold's pings off; ruling 892's proof that the sampler does not move the release)
for part in "$@"; do
  spec=${part#*-}; load=${spec%-*}; kind=${part%%-*}
  off=()
  case $kind in v5n|d1n|d2n) : "${OFF_FLAG:?a sampler-off part needs OFF_FLAG}"; off=(--variant "nopings=$OFF_FLAG") ;; esac
  case $part in
    zero)
      # the step's command in the launcher's form (its own `locked.sh task109-arm64 ` prefix, which it strips: the
      # whole sitting runs in this chain's one hold, holder m5-measure042)
      O=$OUT/zero/V5c.development-run
      { echo "== V5c"
        echo "$D/locked.sh task109-arm64 $NODE $W/scripts/linux-engine-gate/sitting.mjs --dir $O --hold $D/hold-sittings --terminal end -- env WRAP=$W/docs/evidence/2026-10-28-own-linux-engine/m5/guards/wrap71.py $W/docs/evidence/2026-10-28-own-linux-engine/m4/pointer-route/scripts/run71.sh $O $W/ ${CELLS[*]} --blocks $ZBLOCKS --run m5m042-zero"
      } > "$Z/zero-commands-m042.txt"
      [ -e "$O" ] && { log "$O exists: skipped"; continue; }
      # run71 refuses a running load: the run before's stress-ng is waited for, at most 60 s
      for i in $(seq 1 60); do pgrep -x stress-ng > /dev/null || break; sleep 1; done
      run zero locked env HARD_STOP=$(( $(date +%s) + 44 * 60 )) "$Z/sitting.sh" -m042 "$OUT/zero" development-run V5c:30
      code=$?
      case $code in 5|7|8) log "the sitting launcher stopped ($code): chain stopped"; exit "$code" ;; esac ;;
    v5-*|v5n-*)
      la=(); [ "$load" != 0 ] && la=(--load-factor "$load")
      run "$part" locked "$NODE" "$T/scripts/private-run.mjs" "$W" "$OUT/$part" "task 116 development run" "${la[@]}" -- \
        "${CELLS[@]}" "${off[@]}" --blocks "$BLOCKS" --run "m5m042-$part" ;;
    # sel-<load>-<k>: V5's scene's own no-take control, a select drag in front on the same page with the same ballast
    # (chrome_select_nudged_shared, its stray nudges its condition), the candidate alone, BLOCKS blocks
    sel-*)
      la=(); [ "$load" != 0 ] && la=(--load-factor "$load")
      run "$part" locked "$NODE" "$T/scripts/private-run.mjs" "$W" "$OUT/$part" "task 116 development run" "${la[@]}" -- \
        --vendor "$VENDOR" --newest "$NEWEST" --cua "$CAND" --scene device-chrome-dnd --ops chrome_select_nudged_shared \
        --ballast gate --dev --no-audit --blocks "$BLOCKS" --run "m5m042-$part" ;;
    # edn-<load>-<k>: Electron's draggable source with a short path (the dnd experiment's --dnd-short, in front), so the
    # hold runs and its pings are sampled on a press that takes; the lane asks --stats itself (`cua:st`), 30 drags
    edn-*)
      la=(); [ "$load" != 0 ] && la=(--load-factor "$load")
      run "$part" locked "$NODE" "$T/scripts/private-run.mjs" "$W" "$OUT/$part" "task 116 development run" -- \
        --experiment dnd --family electron --dnd-short --vendor "$VENDOR" --newest "$NEWEST" --cua "$CAND" \
        --lanes cua:st --variant "st=--stats" --trials 30 --run "m5m042-$part" "${la[@]}" ;;
    d1-*|d2-*|d1n-*|d2n-*)
      fam=chrome; [ "${kind%n}" = d2 ] && fam=electron
      if [ "$load" != 0 ]; then la=(--load-factor "$load"); lanes=pinned,cua; else la=(); lanes=pinned,newest,cua; fi
      [ ${#off[@]} -gt 0 ] && lanes=$lanes,cua:nopings
      run "$part" locked "$NODE" "$T/scripts/private-run.mjs" "$W" "$OUT/$part" "task 116 development run" -- \
        --experiment drag --vendor "$VENDOR" --newest "$NEWEST" --occlusion visible --family "$fam" --cua "$CAND" \
        --run "m5m042-$part" --lanes "$lanes" --engine-stats ${OPS:+--ops "$OPS"} "${la[@]}" "${off[@]}" ;;
    *) log "unknown part $part"; exit 2 ;;
  esac
done
log "chain done"
