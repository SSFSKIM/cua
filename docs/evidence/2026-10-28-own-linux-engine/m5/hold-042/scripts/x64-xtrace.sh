#!/bin/bash
# Task 113 on x64 (development only): the run's Chrome traced through its own xtrace proxy (chrome-xtrace/), at twice the
# load on a private display, the engine the released 0.4.1 (no final hold): V5's cancel cell, and D1's select and canvas
# (the drag experiment, cua's lane with --engine-stats for its press and release times) as plain no-take controls.
# Each run under the host lock (m5-hold042, 45 min cap); afterwards the proxy's socket file is removed once its xtrace
# has ended. usage: x64-xtrace.sh <part>...   parts: cancel-<k> [blocks via BLOCKS, default 30], controls-<k>
set -u
T=/Users/new/.local/share/cua-171/task113
D=/Users/new/.local/share/cua-171
export CHECKOUT=/Users/new/Developer/GitHub/cua/.claude/worktrees/agent-ae4c2142e66e0c56a
export VENDOR=$D/m5/home-x64-041/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
export NEWEST=$D/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
BASE=$D/m5/home-x64-041/engine/linux/cua-engine
OUT=$T/x64
export PATH=$T/chrome-xtrace:$PATH
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$OUT/chain.log"; }
tidy() {
  local rec=$1.proxy pid fake
  [ -e "$rec" ] || return 0
  while read -r pid fake; do
    for _ in $(seq 1 30); do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
    if kill -0 "$pid" 2>/dev/null; then log "xtrace $pid still running after the run: left, socket X$fake kept"; continue; fi
    rm -f "/tmp/.X11-unix/X$fake" && log "removed the proxy's socket X$fake"
  done < "$rec"
}
for part in "$@"; do
  name=xtrace-$part
  [ -e "$D/hold-sittings" ] && { log "hold-sittings present: $name not started"; exit 5; }
  [ -e "$OUT/$name" ] && { log "$name exists: skipped"; continue; }
  export CUA113_XT_OUT=$OUT/$name.xt.jsonl
  log "start $name"
  case $part in
    cancel-*)
      "$D/locked.sh" m5-hold042 timeout -s TERM -k 60 45m /usr/bin/node "$T/scripts/private-run.mjs" "$CHECKOUT" "$OUT/$name" "task 113 development run" --load-factor 2 -- \
        --vendor "$VENDOR" --newest "$NEWEST" --cua "$BASE" --scene device-chrome-dnd --ops chrome_dnd_shared \
        --blocks "${BLOCKS:-30}" --run "m5h042-$name" --ballast gate --dev --no-audit > "$OUT/$name.out" 2>&1 ;;
    # the drag experiment's own load (--load-factor 2), not the launcher's
    controls-*)
      "$D/locked.sh" m5-hold042 timeout -s TERM -k 60 45m /usr/bin/node "$T/scripts/private-run.mjs" "$CHECKOUT" "$OUT/$name" "task 113 development run" -- \
        --experiment drag --vendor "$VENDOR" --newest "$NEWEST" --occlusion visible --family chrome --ops select,canvas \
        --cua "$BASE" --lanes pinned,cua --trials "${TRIALS:-40}" --engine-stats --load-factor 2 --run "m5h042-$name" > "$OUT/$name.out" 2>&1 ;;
    *) log "unknown part $part"; exit 2 ;;
  esac
  log "end $name exit $?"
  tidy "$CUA113_XT_OUT"
done
