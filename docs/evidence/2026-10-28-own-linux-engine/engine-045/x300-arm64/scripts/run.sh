#!/bin/bash
# Task 160 (from task 147's dev.sh): 0.4.5's t14-floor `left` x300 at arm64 twice the load, development. Task 132's
# harness (t132-run.mjs -> t132-alternate.mjs, `--engine-stats`) from t160-e045 (engine-045 e85ebd379 plus the plan
# t147-left), 12 rounds of 25, one lane (`e045`, the publish=false candidate), on a private display of its own, never
# :0. Under the VM's lock as `locked.sh t160 timeout -s TERM -k 60 90m …`; hold-sittings, the disk (more than 20G
# free) and the candidate's sha256 checked first. CUA_HOME is the pinned home-arm64-044, as task 147 ran it.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task160
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t160-e045
ACC=$D/m5/home-arm64-044
E=$T/home-arm64-045c/engine/linux/cua-engine
SUM=c04ffe7eb1d28b1e38f88bdcb5854c214b39c60a55f6474b34d4c49ff40130fa
OUT=$T/out/x300
mkdir -p "$T/out"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$T/out/run.log"; }
[ -e "$D/hold-sittings" ] && { log "hold-sittings present: not started"; exit 5; }
f=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
[ "$f" -le 20 ] && { log "disk ${f}G free, 20G or less: not started"; exit 9; }
[ -e "$OUT" ] && { log "$OUT exists: not started"; exit 2; }
[ "$(sha256sum "$E" | cut -d' ' -f1)" = "$SUM" ] || { log "the candidate's sha256 differs: not started"; exit 2; }
log "x300: queued at harness $(git -C "$G" rev-parse HEAD) ($(git -C "$G" status --porcelain --untracked-files=no | wc -l) changes), $("$E" --version), df ${f}G load=$(cut -d' ' -f1-3 /proc/loadavg)"
cd "$G" || exit 2
CUA_LOCK_MAX=95m "$D/locked.sh" t160 timeout -s TERM -k 60 90m env CUA_HOME="$ACC" \
  PATH="$D/task59/bin:$D/node24/bin:/Users/new/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
  bash -c '[ -e "'"$D"'/hold-sittings" ] && { echo "hold-sittings present at the hold: not started"; exit 5; }; exec node "'"$T"'/t132-run.mjs" "$@"' _ \
  "$G" "$OUT" chrome t147-left 12 25 2 e045="$E"
code=$?
log "x300: end exit $code load=$(cut -d' ' -f1-3 /proc/loadavg)"
exit $code
