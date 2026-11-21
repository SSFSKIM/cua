#!/bin/bash
# Task 122, ruling 957: t14-long with pinned 0.4.1 and pinned 0.4.2 alternating, 100 drags each (10 rounds, ABBA,
# `--trials 10` a run), at twice the load, in one private-display session, from the H6 checkout t122-h6 for both arms.
# The engines: 0.4.2 is the H6 acceptance home's (home-arm64-042, sha256 25035ca1…, H6's pin); 0.4.1 is H⁗'s acceptance
# home's (home-arm64-041, sha256 8850abcb…, equal to 3b5c0441's runtime/engine/linux-engine.json arm64 asset; its
# attestation verified with `gh attestation verify`, run 44380699966). The harness launches each engine binary itself
# (engine.mjs), and MIN_ENGINE_VERSION is checked only by cua's service client (client.mjs), so nothing steps around
# it. One hold of the host lock (holder task122-arm64); hold-sittings and the disk (ruling 937) checked first. A
# development run, never counted.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task122
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t122-h6
OUT=$D/m5/a957-arm64-h6
E041=$D/m5/home-arm64-041/engine/linux/cua-engine
E042=$D/m5/home-arm64-042/engine/linux/cua-engine
mkdir -p "$OUT"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$OUT/a957.log"; }
[ -e "$D/hold-sittings" ] && { log "hold-sittings present: not started"; exit 5; }
f=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
[ "$f" -le 20 ] && { log "disk: ${f}G free, 20G or less (ruling 937): not started"; exit 9; }
[ -e "$OUT/run" ] && { log "$OUT/run exists: not started"; exit 2; }
[ "$(sha256sum "$E041" | cut -d' ' -f1)" = 8850abcb00d6ee47c72ff102e71cac1578bc7c5bccf7249104493a17242efaa0 ] || { log "0.4.1's sha256 differs: not started"; exit 2; }
[ "$(sha256sum "$E042" | cut -d' ' -f1)" = 25035ca1b4c8f2c4dd42568e570f54f5994da0f894a84c036d59eedc58f1092f ] || { log "0.4.2's sha256 differs: not started"; exit 2; }
log "start at $(git -C "$G" rev-parse HEAD) ($(git -C "$G" status --porcelain | wc -l) changes), 0.4.1 $("$E041" --version), 0.4.2 $("$E042" --version), df ${f}G load=$(cut -d' ' -f1-3 /proc/loadavg)"
cd "$G" || exit 2
CUA_LOCK_MAX=50m "$D/locked.sh" task122-arm64 env CUA_HOME="$D/m5/home-arm64-042" PATH="$D/task59/bin:$D/node24/bin:/Users/new/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  timeout -s TERM -k 120 45m node "$T/a957-run.mjs" "$G" "$OUT/run" 10 "e041=$E041" "e042=$E042"
code=$?
log "end exit $code load=$(cut -d' ' -f1-3 /proc/loadavg)"
exit $code
