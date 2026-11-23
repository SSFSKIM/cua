#!/bin/bash
# Task 147 (from task 136's setup-all.sh): the arm64 setup at H9 = cd03a47b, each part its own hold of the VM's host
# lock (holder h9-arm64): the H9 checkout (t147-h9, fresh, detached; npm ci, electron, xprobe; the Electron binary
# checked, its install run under the lock if a fresh npm ci left it out), then the fresh 0.4.4 acceptance home
# home-arm64-044 (its own `cua install --engine` from the pin, the engine's sha256 against H9's pin, `check --pinned`).
# Item 9 and the doctor are not in the reach list (ruling 1102). It stops at the first part that fails.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task147
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t147-h9
H9=cd03a47bde2a484e1c3ecbf07cc97aada720fda7
L="$D/locked.sh h9-arm64"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$T/setup-all.log"; }
[ -e "$D/hold-sittings" ] && { log "hold-sittings present"; exit 5; }
log "df / avail $(df -BG --output=avail / | tail -1 | tr -d ' ')"
$L "$T/setup.sh" t147-h9 "$H9" > "$T/setup-h9.log" 2>&1; c=$?; log "setup t147-h9 exit $c"
[ "$c" = 0 ] || exit 1
if [ ! -x "$G/node_modules/electron/dist/electron" ]; then
  log "electron binary missing after npm ci: its install under the lock"
  $L bash -c "cd '$G' && $D/node24/bin/node node_modules/electron/install.js" >> "$T/setup-h9.log" 2>&1
fi
[ -x "$G/node_modules/electron/dist/electron" ] || { log "electron binary still missing"; exit 1; }
log "electron present: node_modules/electron/dist/electron"
$L "$T/install-home.sh" > "$T/install-home.log" 2>&1; c=$?; log "install-home exit $c"
[ "$c" = 0 ] || exit 1
log "setup-all done"
