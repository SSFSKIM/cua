#!/bin/bash
# Task 147, ruling 1140: after item 3 (dev.sh handle-long, already running as <pid>), item 4 (t487.sh), then the
# development measurement of t14-floor `left` x100 (dev.sh floor-left, plan t147-left, added to t147-dev as a second
# VM-local commit under the lock). Each part's exit is logged. A part refused at its start (hold-sittings, the disk,
# an existing out dir, the engine's sha256) stops the chain; a part's own result never does, since each is a
# measurement the controller reads.
# usage: chain-1140.sh <item 3's pid>
set -u
D=/Users/new/.local/share/cua-171
T=$D/task147
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t147-dev
E=$D/m5/home-arm64-044/engine/linux/cua-engine
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$T/out/chain-1140.log"; }
mkdir -p "$T/out"
while kill -0 "$1" 2>/dev/null; do sleep 15; done
log "item 3 ended: $(tail -1 "$T/out/dev.log")"
"$T/t487.sh"; c=$?; log "item 4 (t487.sh) exit $c"
case $c in 2|5|9) log "item 4 refused at its start: stopped"; exit $c ;; esac
if ! git -C "$G" log -1 --format=%s | grep -q 't147-left'; then
  "$D/locked.sh" h9-arm64 bash -c "python3 -I '$T/add-left-plan.py' '$G/scripts/linux-engine-diff/drop-signals.mjs' && git -C '$G' -c user.name=task147 -c user.email=task147@localhost commit -q -am 'task 147: development plan t147-left, t14-floor left alone (ruling 1140; VM-local, never pushed)'" || { log "the plan commit failed"; exit 1; }
fi
log "t147-dev: $(git -C "$G" log --oneline -1)"
"$T/dev.sh" floor-left chrome t147-left 4 25 2 h9="$E"; c=$?; log "item 5 (floor-left) exit $c"
log "chain done"
