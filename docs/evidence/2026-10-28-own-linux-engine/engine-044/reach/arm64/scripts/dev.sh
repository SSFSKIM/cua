#!/bin/bash
# Task 147 (from task 132's t132.sh): one alternating set of drop-signals runs (task 132's t132-run.mjs, a private
# display of its own, never :0) from the development checkout t147-dev (H9 plus task 132's VM-local plans), each lane an
# engine binary or a wrapper of the pinned 0.4.4 engine. One hold of the host lock (holder h9-arm64), released at the
# set's end; hold-sittings and the disk (more than 20G free) checked first, and the pinned engine's sha256 against H9's
# pin. CUA_HOME is the acceptance home home-arm64-044. A development measurement, never counted.
# usage: dev.sh <name> <family> <plan> <rounds> <trials|-> <load factor|0> <label>=<engine>...
set -u
D=/Users/new/.local/share/cua-171
T=$D/task147
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t147-dev
ACC=$D/m5/home-arm64-044
E=$ACC/engine/linux/cua-engine
PIN=f54b2aeb8e00676a9f521410156c9bdd1b578e2308724013eef2eb6145c7da3e
name=$1; shift
OUT=$T/out/$name
mkdir -p "$T/out"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$T/out/dev.log"; }
[ -e "$D/hold-sittings" ] && { log "$name: hold-sittings present: not started"; exit 5; }
f=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
[ "$f" -le 20 ] && { log "$name: disk ${f}G free, 20G or less: not started"; exit 9; }
[ -e "$OUT" ] && { log "$name: $OUT exists: not started"; exit 2; }
[ "$(sha256sum "$E" | cut -d' ' -f1)" = "$PIN" ] || { log "$name: the pinned engine's sha256 differs from H9's pin: not started"; exit 2; }
log "$name: queued at harness $(git -C "$G" rev-parse HEAD) ($(git -C "$G" status --porcelain --untracked-files=no | wc -l) changes), $*, df ${f}G load=$(cut -d' ' -f1-3 /proc/loadavg)"
cd "$G" || exit 2
CUA_LOCK_MAX=50m "$D/locked.sh" h9-arm64 bash -c '
  [ -e "'"$D"'/hold-sittings" ] && { echo "hold-sittings present at the hold: not started"; exit 5; }
  exec env CUA_HOME="'"$ACC"'" PATH="'"$D"'/task59/bin:'"$D"'/node24/bin:/Users/new/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
    timeout -s TERM -k 60 45m node "'"$T"'/t132-run.mjs" "$@"' _ "$G" "$OUT" "$@"
code=$?
log "$name: end exit $code load=$(cut -d' ' -f1-3 /proc/loadavg)"
exit $code
