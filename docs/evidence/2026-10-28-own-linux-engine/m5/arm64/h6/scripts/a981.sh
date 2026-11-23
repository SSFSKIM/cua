#!/bin/bash
# Task 122, ruling 981: t14-long's cell with the vendor builds as lanes, on the development branch m5-a959 (bb4d7c1f:
# drop-signals.mjs's `pinned` and `newest` lanes and the plan `t14-long-vendor`), at twice the load. The checkout
# t122-a959 moved to bb4d7c1f (detached, clean; the lockfile is unchanged since da2deeb2, so no npm ci). The launch is
# a953's (L4b's line with the plan swapped, through task 121's private-run.mjs), plus `--vendor` and `--newest`: the
# pinned 26.928.40906 build from the H6 home and the newest 26.1023.51421. `smoke` runs `--trials 2` (2 drags a lane);
# `run` the full plan (100 a lane, the lanes taking turns block by block). Each its own hold of the host lock (holder
# task122-arm64); hold-sittings and the disk (ruling 937) checked before each. Development runs, never counted.
# usage: a981.sh smoke|run...
set -u
D=/Users/new/.local/share/cua-171
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t122-a959
SHA=bb4d7c1f0925fb80411fba285b479676d16217ef
ACC=$D/m5/home-arm64-042
OUT=$D/m5/a981-arm64-m5a959
VENDOR=$ACC/runtimes/26.928.40906-linux-arm64/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_arm64
NEWEST=$D/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_arm64
mkdir -p "$OUT"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$OUT/a981.log"; }
if [ "$(git -C "$G" rev-parse HEAD)" != "$SHA" ]; then
  git -C "$G" fetch -q origin m5-a959 && git -C "$G" checkout -q --detach "$SHA" || { log "checkout of $SHA failed"; exit 2; }
fi
[ -z "$(git -C "$G" status --porcelain)" ] || { log "$G is not clean"; exit 2; }
for set in "$@"; do
  case "$set" in smoke) extra=(--trials 2) ;; run) extra=() ;; *) log "unknown set $set"; exit 2 ;; esac
  [ -e "$D/hold-sittings" ] && { log "hold-sittings present: $set not started"; exit 5; }
  f=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
  [ "$f" -le 20 ] && { log "disk: ${f}G free, 20G or less (ruling 937): $set not started"; exit 9; }
  [ -e "$OUT/$set" ] && { log "$OUT/$set exists: not started"; exit 2; }
  log "start $set at $(git -C "$G" rev-parse HEAD), df ${f}G load=$(cut -d' ' -f1-3 /proc/loadavg)"
  cd "$G" || exit 2
  CUA_LOCK_MAX=50m "$D/locked.sh" task122-arm64 env CUA_HOME="$ACC" PATH="$D/task59/bin:$D/node24/bin:/Users/new/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
    timeout -s TERM -k 120 45m node "$G/docs/evidence/2026-10-28-own-linux-engine/m5/engine-042/h6/scripts/private-run.mjs" "$G" "$OUT/$set" \
    "development run, not a release gate (task 122, ruling 981 on m5-a959 bb4d7c1f, set $set)" -- \
    --experiment drop-signals --family chrome --plan t14-long-vendor --load-factor 2 --vendor "$VENDOR" --newest "$NEWEST" \
    --cua "$ACC/engine/linux/cua-engine" --run "dev-a981-$set" ${extra[@]+"${extra[@]}"}
  code=$?
  log "end $set exit $code load=$(cut -d' ' -f1-3 /proc/loadavg)"
  # the judge's T14 table counts the vendor's plain oks as false oks, so the run may exit 1: the counts are read from
  # the rows. Anything else stops it
  [ "$code" -ne 0 ] && [ "$code" -ne 1 ] && { log "$set ended $code: stopped"; exit "$code"; }
done
log "a981 done: $*"
