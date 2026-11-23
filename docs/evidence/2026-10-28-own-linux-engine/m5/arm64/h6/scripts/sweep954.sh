#!/bin/bash
# Task 122, ruling 954.2: arm64's inside-band sweep at twice the load on task 125's candidate m5-h7 (348cae0f), a
# development run, never counted. It launches as L4c's line does (drop-signals.mjs's harness run, `--load-factor 2`,
# the 0.4.2 home's engine, CUA_HOME and the gate's PATH), changed in exactly these ways: the checkout is t122-h7
# (detached at 348cae0f); `--plan t14-late` becomes `--plan freeze-042-inside` (freeze-500, -550, -600 x10);
# `--run pinned-L4c` becomes `--run dev-954-freeze-042-inside`; `--pinned` is left out (a development run); the out dir
# is m5/s954-arm64-h7/freeze-042-inside; and it runs through the checkout's private-run.mjs (display.mjs
# `runOnPrivateDisplay`) instead of `gate.mjs run`. Under the host lock (holder task122-arm64); hold-sittings and the
# disk (ruling 937) checked first.
set -u
D=/Users/new/.local/share/cua-171
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t122-h7
ACC=$D/m5/home-arm64-042
OUT=$D/m5/s954-arm64-h7
plan=freeze-042-inside
mkdir -p "$OUT"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$OUT/s954.log"; }
[ -e "$D/hold-sittings" ] && { log "hold-sittings present: not started"; exit 5; }
f=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
[ "$f" -le 20 ] && { log "disk: ${f}G free, 20G or less (ruling 937): not started"; exit 9; }
[ -e "$OUT/$plan" ] && { log "$OUT/$plan exists: not started"; exit 2; }
log "start $plan at $(git -C "$G" rev-parse HEAD) ($(git -C "$G" status --porcelain | wc -l) changes) df ${f}G load=$(cut -d' ' -f1-3 /proc/loadavg) xprop $(command -v xprop) stdbuf $(command -v stdbuf)"
cd "$G" || exit 2
CUA_LOCK_MAX=50m "$D/locked.sh" task122-arm64 env CUA_HOME="$ACC" PATH="$D/task59/bin:$D/node24/bin:/Users/new/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  timeout -s TERM -k 120 45m node "$G/docs/evidence/2026-10-28-own-linux-engine/m5/engine-042/h6/scripts/private-run.mjs" "$G" "$OUT/$plan" \
  "development run, not a release gate (task 122, ruling 954.2, plan $plan, m5-h7 348cae0f)" -- \
  --experiment drop-signals --family chrome --plan "$plan" --load-factor 2 --cua "$ACC/engine/linux/cua-engine" --run "dev-954-$plan"
code=$?
log "end $plan exit $code load=$(cut -d' ' -f1-3 /proc/loadavg)"
exit $code
