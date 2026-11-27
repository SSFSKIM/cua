#!/bin/bash
# Task 165 (from task 163's setup-all.sh): the arm64 setup for FB at main 854103aa5, each part its own hold of the VM's host
# lock (holder t165-arm64): the main checkout (t165-main, fresh, detached; npm ci, electron, xprobe; the Electron binary
# checked, its install run under the lock if a fresh npm ci left it out), then the fresh 0.4.5 home
# home-arm64-045-main (its own `cua install --engine` from the pin, the engine's sha256 against the pin, `check --pinned`).
# Item 9 and the doctor are not in the reach list (ruling 1102). It stops at the first part that fails.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task165
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t165-main
MAIN=854103aa58b56521ba85afb4b392e1f3c5a8287d
L="$D/locked.sh t165-arm64"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$T/setup-all.log"; }
[ -e "$D/hold-sittings" ] && { log "hold-sittings present"; exit 5; }
log "df / avail $(df -BG --output=avail / | tail -1 | tr -d ' ')"
$L "$T/setup.sh" t165-main "$MAIN" > "$T/setup-main.log" 2>&1; c=$?; log "setup t165-main exit $c"
[ "$c" = 0 ] || exit 1
if [ ! -x "$G/node_modules/electron/dist/electron" ]; then
  log "electron binary missing after npm ci: its install under the lock"
  $L bash -c "cd '$G' && $D/node24/bin/node node_modules/electron/install.js" >> "$T/setup-main.log" 2>&1
fi
[ -x "$G/node_modules/electron/dist/electron" ] || { log "electron binary still missing"; exit 1; }
log "electron present: node_modules/electron/dist/electron"
$L "$T/install-home.sh" > "$T/install-home.log" 2>&1; c=$?; log "install-home exit $c"
[ "$c" = 0 ] || exit 1
log "setup-all done"
