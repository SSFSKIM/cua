#!/bin/bash
# Task 130, copied from task 126 (#459's prototype, ruling 962.2) on x64: D1's Chrome drag-and-drop cell (the drag experiment's `dnd` op, idle,
# a private display of its own through task 116's private-run.mjs, the vendor builds D1 names), every cua lane the
# prototype's build: `cua` with the step off, and one variant lane per form, the lanes interleaved block by block as
# the experiment interleaves them, `--engine-stats` so each drag's step record is kept. The interval of each cua lane
# against the newest build is D1's judge (#358's 40 ms). Under the host lock (holder task126), hold-sittings and the
# disk checked first. Development runs, never counted. Never :0.
# usage: d1.sh <name> <prototype engine> [<repeat k>]
set -u
D=/Users/new/.local/share/cua-171
T=$D/task130
# the harness: task 123's H6 checkout (69bd7993, clean, npm ci and xprobe done), read only, as D1 ran at H6
CHECKOUT=/Users/new/Developer/GitHub/cua/.claude/worktrees/t123-x64
PROTO=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/m5-p459
RUNNER=$PROTO/docs/evidence/2026-10-28-own-linux-engine/m5/engine-042/measure/scripts/private-run.mjs
VENDOR=$D/m5/home-x64-042/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
NEWEST=$D/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
name=$1; CAND=$2
OUT=$T/x64/$name
mkdir -p "$T/x64"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$T/x64/d1.log"; }
[ -e "$D/hold-sittings" ] && { log "$name: hold-sittings present: not started"; exit 5; }
f=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
[ "$f" -le 20 ] && { log "$name: disk ${f}G free (ruling 937): not started"; exit 9; }
[ -e "$OUT" ] && { log "$name: exists: not started"; exit 2; }
log "$name: queued, engine $CAND ($(sha256sum "$CAND" | cut -c1-16)), df ${f}G"
"$D/locked.sh" task130-x64 timeout -s TERM -k 60 45m /usr/bin/node "$RUNNER" "$CHECKOUT" "$OUT" "task 130 development run (#459's prototype, D1's dnd cell)" -- \
  --experiment drag --vendor "$VENDOR" --newest "$NEWEST" --occlusion visible --family chrome --cua "$CAND" \
  --ops dnd --lanes pinned,newest,cua,cua:tail,cua:tail-outlasted,cua:ping-outlasted \
  --variant "tail=--drag-dnd-release-sync tail" \
  --variant "tail-outlasted=--drag-dnd-release-sync tail --drag-dnd-release-sync-when outlasted" \
  --variant "ping-outlasted=--drag-dnd-release-sync ping --drag-dnd-release-sync-when outlasted" \
  --engine-stats --run "dev-t130-$name"
code=$?
log "$name: end exit $code load=$(cut -d' ' -f1-3 /proc/loadavg)"
exit $code
