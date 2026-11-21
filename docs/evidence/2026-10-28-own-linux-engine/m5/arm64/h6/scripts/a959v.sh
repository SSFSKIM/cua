#!/bin/bash
# Task 122, rulings 959 and 964: the vendor baseline on #459's path, on the development branch m5-a959 (da2deeb2, H6
# plus one change: the device cell chrome_dnd_long_left_in_front_shared is no longer `cuaOnly`, so the vendor builds run
# it). V5's device cell (device.mjs, the long path across the zone and out of it, its release right after its last
# step) as a development verdict run, its three lanes the pinned vendor build, the newest vendor build and cua 0.4.2
# (the H6 home's), the harness's blocks rotating the engines, from the checkout t122-a959 on a private display (task
# 121's private-run.mjs,
# display.mjs `runOnPrivateDisplay`), at twice the load: a verdict run takes no --load-factor (only the experiments start
# a load, experiments.mjs `startLoad`), so this script starts the same load itself, `stress-ng --cpu <2 x cores>
# --cpu-method matrixprod --quiet` (L4b's LOAD2 as startLoad starts it), before the run and ends it after. Three sets of
# 12 blocks (3 samples a block and lane, so 36 a lane a set, 108 in all), each its own hold of the host lock (holder
# task122-arm64), so the lock is free between them; hold-sittings and the disk (ruling 937) checked before each.
# usage: a959v.sh <set>...   (sets v1 v2 v3)
set -u
D=/Users/new/.local/share/cua-171
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t122-a959
ACC=$D/m5/home-arm64-042
OUT=$D/m5/a959-arm64-m5a959
VENDOR=$ACC/runtimes/26.928.40906-linux-arm64/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_arm64
NEWEST=$D/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_arm64
mkdir -p "$OUT"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$OUT/a959.log"; }
for set in "$@"; do
  [ -e "$D/hold-sittings" ] && { log "hold-sittings present: $set not started"; exit 5; }
  f=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
  [ "$f" -le 20 ] && { log "disk: ${f}G free, 20G or less (ruling 937): $set not started"; exit 9; }
  [ -e "$OUT/$set" ] && { log "$OUT/$set exists: not started"; exit 2; }
  log "start $set at $(git -C "$G" rev-parse HEAD), cua $("$ACC/engine/linux/cua-engine" --version), df ${f}G load=$(cut -d' ' -f1-3 /proc/loadavg)"
  cd "$G" || exit 2
  CUA_LOCK_MAX=50m "$D/locked.sh" task122-arm64 bash -c '
    set -u
    setsid stress-ng --cpu $(( $(nproc) * 2 )) --cpu-method matrixprod --timeout 3h --quiet < /dev/null > /dev/null 2>&1 &
    sp=$!
    echo "$(date -u +%FT%TZ) load started: stress-ng pid $sp, $(( $(nproc) * 2 )) workers" >> "$1/a959.log"
    env CUA_HOME="$2" PATH="$3/task59/bin:$3/node24/bin:/Users/new/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
      timeout -s TERM -k 120 44m node "$4/docs/evidence/2026-10-28-own-linux-engine/m5/engine-042/h6/scripts/private-run.mjs" "$4" "$1/$5" \
      "development run, not a release gate (task 122, ruling 959 on m5-a959 da2deeb2, the vendor lanes, set $5, at twice the load)" -- \
      --vendor "$6" --newest "$7" --cua "$2/engine/linux/cua-engine" --scene device-chrome-dnd --ops chrome_dnd_long_left_in_front_shared \
      --blocks 12 --dev --run "dev-a959v-$5"
    c=$?
    kill -TERM -- -"$sp" 2>/dev/null
    echo "$(date -u +%FT%TZ) load ended" >> "$1/a959.log"
    exit $c' a959 "$OUT" "$ACC" "$D" "$G" "$set" "$VENDOR" "$NEWEST"
  code=$?
  log "end $set exit $code load=$(cut -d' ' -f1-3 /proc/loadavg)"
  [ "$code" -ne 0 ] && [ "$code" -ne 1 ] && { log "$set ended $code: stopped"; exit "$code"; }
done
log "a959 done: $*"
