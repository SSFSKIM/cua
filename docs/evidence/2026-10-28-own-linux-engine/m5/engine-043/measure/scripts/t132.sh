#!/bin/bash
# Task 132 on the arm64 VM (from task 131's t131.sh): one alternating set of drop-signals runs (t132-run.mjs, a
# private display of its own, never :0) from the harness checkout t132-h71 (the candidate f9d1f86b, whose scripts are
# H7.1's 96fa1fd3, plus the VM-local development plans of add-plans.py), each lane an engine binary or a wrapper of
# the candidate with a measurement flag. One hold of the host lock (holder task132-arm64), released at the set's end;
# hold-sittings and the disk (more than 20G free) checked first, and the pinned 0.4.2's sha256. Development runs,
# never counted.
# usage: t132.sh <name> <family> <plan> <rounds> <trials|-> <load factor|0> <label>=<engine>...
set -u
D=/Users/new/.local/share/cua-171
T=$D/task132
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t132-h71
E042=$D/m5/home-arm64-042/engine/linux/cua-engine
name=$1; shift
OUT=$T/out/$name
mkdir -p "$T/out"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$T/out/t132.log"; }
[ -e "$D/hold-sittings" ] && { log "$name: hold-sittings present: not started"; exit 5; }
f=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
[ "$f" -le 20 ] && { log "$name: disk ${f}G free, 20G or less: not started"; exit 9; }
[ -e "$OUT" ] && { log "$name: $OUT exists: not started"; exit 2; }
[ "$(sha256sum "$E042" | cut -d' ' -f1)" = 25035ca1b4c8f2c4dd42568e570f54f5994da0f894a84c036d59eedc58f1092f ] || { log "$name: 0.4.2's sha256 differs: not started"; exit 2; }
# the candidate checked: f9d1f86b's local build by default; the handle-tail head's CI artifact with T132_CAND and
# T132_CAND_SHA (ruling 1026)
CAND=${T132_CAND:-$T/home-arm64-043/engine/linux/cua-engine}
CAND_SHA=${T132_CAND_SHA:-b6e906df2435c6daa9326cfd4713512f9a8798f67015d4d88cc4d8c7a457a5f3}
[ "$(sha256sum "$CAND" | cut -d' ' -f1)" = "$CAND_SHA" ] || { log "$name: the candidate's sha256 differs: not started"; exit 2; }
log "$name: queued at harness $(git -C "$G" rev-parse HEAD) ($(git -C "$G" status --porcelain --untracked-files=no | wc -l) changes), $*, df ${f}G load=$(cut -d' ' -f1-3 /proc/loadavg)"
cd "$G" || exit 2
CUA_LOCK_MAX=50m "$D/locked.sh" task132-arm64 bash -c '
  [ -e "'"$D"'/hold-sittings" ] && { echo "hold-sittings present at the hold: not started"; exit 5; }
  exec env CUA_HOME="'"$D"'/m5/home-arm64-042" PATH="'"$D"'/task59/bin:'"$D"'/node24/bin:/Users/new/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
    timeout -s TERM -k 60 45m node "'"$T"'/scripts/t132-run.mjs" "$@"' _ "$G" "$OUT" "$@"
code=$?
log "$name: end exit $code load=$(cut -d' ' -f1-3 /proc/loadavg)"
exit $code
