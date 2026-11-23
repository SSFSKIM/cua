#!/bin/bash
# Task 147, item 4 (arm64 only; rulings 1102, 1113): `t487-named` x30 at twice the load on the pinned 0.4.4, measured and
# not gated. Task 142's command (docs/evidence/.../m5/harness-487/README.md) with `--trials 30 --load-factor 2`: its
# private-run.mjs (the gate's `runOnPrivateDisplay`: Xvfb, Openbox, the `person` xterm; never :0) from the H9 checkout
# t147-h9, read only, CUA_HOME the acceptance home home-arm64-044, the engine its pinned 0.4.4. One hold of the host lock
# (holder h9-arm64); hold-sittings and the disk (more than 20G free) checked first, and the engine's sha256 against
# H9's pin. A development measurement, never counted.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task147
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t147-h9
ACC=$D/m5/home-arm64-044
E=$ACC/engine/linux/cua-engine
PIN=f54b2aeb8e00676a9f521410156c9bdd1b578e2308724013eef2eb6145c7da3e
OUT=$T/out/t487-named
LABEL=dev-t147-t487-named-044-load2
P=$G/docs/evidence/2026-10-28-own-linux-engine/m5/harness-487/private-run.mjs
mkdir -p "$T/out"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$T/out/dev.log"; }
[ -e "$D/hold-sittings" ] && { log "t487-named: hold-sittings present: not started"; exit 5; }
f=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
[ "$f" -le 20 ] && { log "t487-named: disk ${f}G free, 20G or less: not started"; exit 9; }
[ -e "$OUT" ] && { log "t487-named: $OUT exists: not started"; exit 2; }
[ "$(sha256sum "$E" | cut -d' ' -f1)" = "$PIN" ] || { log "t487-named: the pinned engine's sha256 differs from H9's pin: not started"; exit 2; }
log "t487-named: queued at $(git -C "$G" rev-parse HEAD) ($(git -C "$G" status --porcelain --untracked-files=no | wc -l) changes), df ${f}G load=$(cut -d' ' -f1-3 /proc/loadavg)"
cd "$G" || exit 2
CUA_LOCK_MAX=50m "$D/locked.sh" h9-arm64 bash -c '
  [ -e "'"$D"'/hold-sittings" ] && { echo "hold-sittings present at the hold: not started"; exit 5; }
  exec env CUA_HOME="'"$ACC"'" PATH="'"$D"'/task59/bin:'"$D"'/node24/bin:/Users/new/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
    timeout -s TERM -k 60 45m node "'"$P"'" "'"$OUT"'" "'"$LABEL"'" --experiment drop-signals --family electron --plan t487-named \
      --trials 30 --load-factor 2 --cua "'"$E"'" --run "'"$LABEL"'"' > "$T/out/t487-named.driver.out" 2>&1
code=$?
log "t487-named: end exit $code load=$(cut -d' ' -f1-3 /proc/loadavg)"
exit $code
