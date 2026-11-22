#!/bin/bash
# Task 126 (#459's prototype, rulings 957 and 958) on the arm64 VM: one alternating set of drop-signals runs
# (p459-run.mjs, a private display of its own), from the H6 checkout t122-h6's harness (the harness task 122's a953 ran:
# the same plan, judge and launch, unchanged), each lane an engine: the pinned 0.4.2 as the control, and the
# prototype's build through a wrapper per form that adds its measurement flag. One hold of the host lock (holder
# task126-arm64, never broken: it waits); hold-sittings and the disk (ruling 937: more than 20G free) checked first.
# Development runs, never counted.
# usage: p459.sh <name> <plan> <rounds> <trials> <load factor|0> <label>=<engine>...
set -u
D=/Users/new/.local/share/cua-171
T=$D/task126
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t122-h6
E042=$D/m5/home-arm64-042/engine/linux/cua-engine
name=$1; shift
OUT=$T/out/$name
mkdir -p "$T/out"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$T/out/p459.log"; }
[ -e "$D/hold-sittings" ] && { log "$name: hold-sittings present: not started"; exit 5; }
f=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
[ "$f" -le 20 ] && { log "$name: disk ${f}G free, 20G or less (ruling 937): not started"; exit 9; }
[ -e "$OUT" ] && { log "$name: $OUT exists: not started"; exit 2; }
[ "$(sha256sum "$E042" | cut -d' ' -f1)" = 25035ca1b4c8f2c4dd42568e570f54f5994da0f894a84c036d59eedc58f1092f ] || { log "$name: 0.4.2's sha256 differs: not started"; exit 2; }
log "$name: queued at harness $(git -C "$G" rev-parse HEAD) ($(git -C "$G" status --porcelain | wc -l) changes), lanes $*, df ${f}G load=$(cut -d' ' -f1-3 /proc/loadavg)"
cd "$G" || exit 2
CUA_LOCK_MAX=50m "$D/locked.sh" task126-arm64 bash -c '
  [ -e "'"$D"'/hold-sittings" ] && { echo "hold-sittings present at the hold: not started"; exit 5; }
  exec env CUA_HOME="'"$D"'/m5/home-arm64-042" PATH="'"$D"'/task59/bin:'"$D"'/node24/bin:/Users/new/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
    timeout -s TERM -k 60 45m node "'"$T"'/p459-run.mjs" "$@"' _ "$G" "$OUT" "$@"
code=$?
log "$name: end exit $code load=$(cut -d' ' -f1-3 /proc/loadavg)"
exit $code
