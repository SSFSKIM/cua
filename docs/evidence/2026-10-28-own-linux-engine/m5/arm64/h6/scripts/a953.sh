#!/bin/bash
# Task 122, ruling 953: the shipped twin of L4b at twice the load, development runs, never counted. L4b's launch at H6
# (launch-plan.mjs: drop-signals.mjs's harness run, the 0.4.2 home's engine, CUA_HOME and the gate's PATH), changed in
# exactly these ways: `--plan t14` becomes `--plan <plan>` (t14-floor, then t14-long: the `cua` lane, no measurement
# flag); `--run pinned-L4b` becomes `--run dev-a953-<plan>`; `--pinned` is left out (a development run, as an
# experiment with no gate takes no flag; stepArgs); the out dir is m5/a953-arm64-h6/<plan>; and it runs through task
# 121's private-run.mjs (display.mjs `runOnPrivateDisplay`, the private display a gate step gets) instead of `gate.mjs
# run`. `--load-factor 2` (LOAD2) is kept. Under the host lock (holder task122-arm64), one hold per plan; hold-sittings and
# the disk (ruling 937) checked before each.
# usage: a953.sh <plan>...
set -u
D=/Users/new/.local/share/cua-171
T=$D/task122
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t122-h6
ACC=$D/m5/home-arm64-042
OUT=$D/m5/a953-arm64-h6
mkdir -p "$OUT"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$OUT/a953.log"; }
for plan in "$@"; do
  [ -e "$D/hold-sittings" ] && { log "hold-sittings present: $plan not started"; exit 5; }
  f=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
  [ "$f" -le 20 ] && { log "disk: ${f}G free, 20G or less (ruling 937): $plan not started"; exit 9; }
  [ -e "$OUT/$plan" ] && { log "$OUT/$plan exists: not started"; exit 2; }
  log "start $plan df ${f}G load=$(cut -d' ' -f1-3 /proc/loadavg)"
  cd "$G" || exit 2
  CUA_LOCK_MAX=50m "$D/locked.sh" task122-arm64 env CUA_HOME="$ACC" PATH="$D/task59/bin:$D/node24/bin:/Users/new/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
    timeout -s TERM -k 120 45m node "$G/docs/evidence/2026-10-28-own-linux-engine/m5/engine-042/h6/scripts/private-run.mjs" "$G" "$OUT/$plan" \
    "development run, not a release gate (task 122, ruling 953, plan $plan)" -- \
    --experiment drop-signals --family chrome --plan "$plan" --load-factor 2 --cua "$ACC/engine/linux/cua-engine" --run "dev-a953-$plan"
  code=$?
  log "end $plan exit $code load=$(cut -d' ' -f1-3 /proc/loadavg)"
  [ "$code" -ne 0 ] && { log "$plan exited $code: stopped for the controller"; exit 1; }
done
log "a953 done: $*"
