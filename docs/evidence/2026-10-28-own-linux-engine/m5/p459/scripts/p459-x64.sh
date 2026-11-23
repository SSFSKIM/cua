#!/bin/bash
# Task 126 (ruling 981.2) on x64: p459.sh's x64 twin. It runs one alternating set of drop-signals runs on a private
# display of its own (never :0), from task 123's H6 checkout t123-x64 (the harness D1 and a953 ran at H6, unchanged,
# read only). The lanes are the pinned 0.4.2 (x64 asset a1314106...) and the prototype's wrappers. One hold of the
# host lock (holder task126); hold-sittings and the disk are checked first. Development runs, never counted.
# usage: p459-x64.sh <name> <plan> <rounds> <trials> <load factor|0> <label>=<engine>...
set -u
D=/Users/new/.local/share/cua-171
T=$D/task126
S=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/m5-p459-scratch
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t123-x64
E042=$D/m5/home-x64-042/engine/linux/cua-engine
name=$1; shift
OUT=$T/x64/$name
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$T/x64/p459.log"; }
[ -e "$D/hold-sittings" ] && { log "$name: hold-sittings present: not started"; exit 5; }
f=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
[ "$f" -le 20 ] && { log "$name: disk ${f}G free (ruling 937): not started"; exit 9; }
[ -e "$OUT" ] && { log "$name: $OUT exists: not started"; exit 2; }
[ "$(sha256sum "$E042" | cut -d' ' -f1)" = a1314106a388167191670d38c0b67292617fe0f7e929f133ff7343b4a8a85a78 ] || { log "$name: 0.4.2's sha256 differs"; exit 2; }
log "$name: queued, lanes $*, df ${f}G load=$(cut -d' ' -f1-3 /proc/loadavg)"
cd "$G" || exit 2
"$D/locked.sh" task126 env CUA_HOME="$D/m5/home-x64-042" PATH="$D/task59/bin:$PATH" \
  timeout -s TERM -k 60 45m node "$S/p459-run.mjs" "$G" "$OUT" "$@"
code=$?
log "$name: end exit $code load=$(cut -d' ' -f1-3 /proc/loadavg)"
exit $code
