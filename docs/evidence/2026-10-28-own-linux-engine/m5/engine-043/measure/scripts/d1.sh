#!/bin/bash
# Task 132 (from task 130's d1.sh) on x64: D1's Chrome drag-and-drop cell (the drag experiment's `dnd` op, idle, a
# private display of its own through task 116's private-run.mjs, the vendor builds D1 names), the cua lanes the 0.4.3
# candidate: `cua` as it ships (the tail, gated when outlasted, with its in-floor form) and `cua:off`
# (`--drag-dnd-release-sync off`, 0.4.2's release), interleaved block by block as the experiment interleaves its lanes,
# `--engine-stats` so each drag's step record is kept. The interval of each cua lane against the newest build is D1's
# judge (#358's 40 ms). The harness is task 129's H7.1 checkout t129-x64 (96fa1fd3, clean), read only. Under the host
# lock (holder task132-x64), hold-sittings and the disk checked first. Development runs, never counted. Never :0.
# usage: d1.sh <name>
set -u
D=/Users/new/.local/share/cua-171
T=$D/task132
CHECKOUT=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/t129-x64
RUNNER=$T/scripts/private-run.mjs
VENDOR=$D/m5/home-x64-042/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
NEWEST=$D/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
CAND=$T/home-x64-043/engine/linux/cua-engine
name=$1
OUT=$T/x64/$name
mkdir -p "$T/x64"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$T/x64/d1.log"; }
[ -e "$D/hold-sittings" ] && { log "$name: hold-sittings present: not started"; exit 5; }
f=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
[ "$f" -le 20 ] && { log "$name: disk ${f}G free: not started"; exit 9; }
[ -e "$OUT" ] && { log "$name: exists: not started"; exit 2; }
[ "$(sha256sum "$CAND" | cut -d' ' -f1)" = "$(cat "$T/bin/x64.sha256")" ] || { log "$name: the candidate's sha256 differs: not started"; exit 2; }
log "$name: queued, engine $CAND ($(sha256sum "$CAND" | cut -c1-16), $("$CAND" --version)), harness $(git -C "$CHECKOUT" rev-parse --short=8 HEAD) ($(git -C "$CHECKOUT" status --porcelain --untracked-files=no | wc -l) changes), df ${f}G"
"$D/locked.sh" task132-x64 timeout -s TERM -k 60 45m /usr/bin/node "$RUNNER" "$CHECKOUT" "$OUT" "task 132 development run (the linux-engine 0.4.3 candidate, D1's dnd cell)" -- \
  --experiment drag --vendor "$VENDOR" --newest "$NEWEST" --occlusion visible --family chrome --cua "$CAND" \
  --ops dnd --lanes pinned,newest,cua,cua:off \
  --variant "off=--drag-dnd-release-sync off" \
  --engine-stats --run "dev-t132-$name"
code=$?
log "$name: end exit $code load=$(cut -d' ' -f1-3 /proc/loadavg)"
exit $code
