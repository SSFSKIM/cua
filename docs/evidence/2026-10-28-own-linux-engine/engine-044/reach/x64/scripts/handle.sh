#!/bin/bash
# Task 148 (task 132's t132.sh, re-pointed at x64 and H9): item 3, Chrome drag_handle long-left at twice the load, one
# alternating set of drop-signals runs (t132-run.mjs, a private display of its own, never :0) from the H9 checkout
# t148-x64 with task 132's development plans (add-plans.py) applied uncommitted, after the counted steps. The lanes: the
# pinned 0.4.4 engine of home-x64-044 and the same binary with `--drag-dnd-release-sync off` (the control lane task 132
# ran with it). One hold of the host lock (holder h9-x64), released at the set's end; hold-sittings and the disk (more
# than 20G free) checked first, and the engine's sha256 against the pin. A development measurement, never counted.
# usage: handle.sh <name> <family> <plan> <rounds> <trials|-> <load factor|0> <label>=<engine>...
set -u
D=/Users/new/.local/share/cua-171
T=$D/task148
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/t148-x64
ACC=$D/m5/home-x64-044
E=$ACC/engine/linux/cua-engine
PIN=eff8befcf591b937c3b019f32a2b9e36b47d126ffb12b1c187dc18519e4d67ca
name=$1; shift
OUT=$T/out/$name
mkdir -p "$T/out"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$T/out/handle.log"; }
[ -e "$D/hold-sittings" ] && { log "$name: hold-sittings present: not started"; exit 5; }
f=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
[ "$f" -le 20 ] && { log "$name: disk ${f}G free, 20G or less: not started"; exit 9; }
[ -e "$OUT" ] && { log "$name: $OUT exists: not started"; exit 2; }
[ "$(sha256sum "$E" | cut -d' ' -f1)" = "$PIN" ] || { log "$name: the engine's sha256 differs from the pin: not started"; exit 2; }
log "$name: queued at harness $(git -C "$G" rev-parse HEAD) ($(git -C "$G" status --porcelain --untracked-files=no | wc -l) changes), engine $("$E" --version), $*, df ${f}G load=$(cut -d' ' -f1-3 /proc/loadavg)"
cd "$G" || exit 2
CUA_LOCK_MAX=50m "$D/locked.sh" h9-x64 bash -c '
  [ -e "'"$D"'/hold-sittings" ] && { echo "hold-sittings present at the hold: not started"; exit 5; }
  exec env CUA_HOME="'"$ACC"'" timeout -s TERM -k 60 45m /usr/bin/node "'"$T"'/scripts/t132-run.mjs" "$@"' _ "$G" "$OUT" "$@"
code=$?
log "$name: end exit $code load=$(cut -d' ' -f1-3 /proc/loadavg)"
exit $code
