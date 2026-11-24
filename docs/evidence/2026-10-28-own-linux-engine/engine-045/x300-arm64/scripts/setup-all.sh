#!/bin/bash
# Task 160 (rulings 1142, 1193, 1194): the arm64 setup for 0.4.5's t14-floor `left` x300. Each part its own hold of the
# VM's host lock (holder t160):
#  1. a fresh worktree t160-e045 detached at engine-045 e85ebd379 (npm ci, the Electron binary checked, xprobe; task
#     147's setup.sh), then task 147's plan `t147-left` = [['cua', 'left', 25]] as one VM-local commit (never pushed);
#  2. the publish=false candidate (run 45321559071's arm64 asset, sha256 c04ffe7e…30fa) placed in a run-owned home
#     task160/home-arm64-045c/engine/linux/cua-engine (the install layout, as task 132 placed its candidates), its sum
#     and --version checked. CUA_HOME stays the pinned home-arm64-044, as task 147's x100 ran it.
# It stops at the first part that fails.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task160
R=/Users/new/Developer/GitHub/cua
G=$R/.claude/worktrees/t160-e045
HEAD=e85ebd3798ea45f5f6d475b13c52bd72c5820078
SUM=c04ffe7eb1d28b1e38f88bdcb5854c214b39c60a55f6474b34d4c49ff40130fa
L="$D/locked.sh t160"
export PATH=$D/node24/bin:$PATH
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$T/setup-all.log"; }
[ -e "$D/hold-sittings" ] && { log "hold-sittings present"; exit 5; }
log "df / avail $(df -BG --output=avail / | tail -1 | tr -d ' ')"
$L "$T/setup.sh" t160-e045 "$HEAD" > "$T/setup-e045.log" 2>&1; c=$?; log "setup t160-e045 exit $c"
[ "$c" = 0 ] || exit 1
[ -x "$G/node_modules/electron/dist/electron" ] || { log "electron binary missing"; exit 1; }
log "electron present: $("$G/node_modules/electron/dist/electron" --version 2>/dev/null)"
$L python3 -I "$T/add-left-plan.py" "$G/scripts/linux-engine-diff/drop-signals.mjs" || { log "the plan edit failed"; exit 1; }
git -C "$G" -c user.name=task160 -c user.email=task160@localhost commit -q -am "task 160: task 147's development plan t147-left, t14-floor left alone (VM-local, never pushed)" || exit 1
log "t160-e045: $(git -C "$G" log --oneline -1); $(git -C "$G" diff --stat HEAD~1 HEAD | tail -1)"
H=$T/home-arm64-045c/engine/linux
mkdir -p "$H"
install -m 755 "$T/cua-engine-0.4.5-linux-arm64" "$H/cua-engine"
s=$(sha256sum "$H/cua-engine" | cut -d' ' -f1)
log "candidate: sha256 $s $([ "$s" = "$SUM" ] && echo 'equals run 45321559071'"'"'s' || echo DIFFERS); $("$H/cua-engine" --version); $(file -b "$H/cua-engine" | cut -c1-80)"
[ "$s" = "$SUM" ] || exit 1
log "setup-all done"
