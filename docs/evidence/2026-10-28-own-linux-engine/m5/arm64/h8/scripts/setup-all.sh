#!/bin/bash
# Task 136: the setup at H8 = 048140a2, each part its own hold of the host lock (holder h8-arm64): the H8 checkout
# (t136-h8, fresh, detached; npm ci, electron, xprobe; the Electron binary checked, its install run under the lock if a
# fresh npm ci left it out), the fresh 0.4.3 acceptance home (its own `cua install --engine`, the engine's sha256 against
# H8's pin, `check --pinned`), then item 9 (the fresh-home install and doctor) and the doctor on the pinned home, on a
# private display. It stops at the first part that fails.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task136
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t136-h8
H8=048140a2bde0f6398cc910c1aa14ecf2e7e51004
L="$D/locked.sh h8-arm64"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$T/setup-all.log"; }
[ -e "$D/hold-sittings" ] && { log "hold-sittings present"; exit 5; }
log "df / avail $(df -BG --output=avail / | tail -1 | tr -d ' ')"
$L "$T/setup.sh" t136-h8 "$H8" > "$T/setup-h8.log" 2>&1; c=$?; log "setup t136-h8 exit $c"
[ "$c" = 0 ] || exit 1
if [ ! -x "$G/node_modules/electron/dist/electron" ]; then
  log "electron binary missing after npm ci: its install under the lock"
  $L bash -c "cd '$G' && $D/node24/bin/node node_modules/electron/install.js" >> "$T/setup-h8.log" 2>&1
fi
[ -x "$G/node_modules/electron/dist/electron" ] || { log "electron binary still missing"; exit 1; }
log "electron present: node_modules/electron/dist/electron"
$L "$T/install-home.sh" > "$T/install-home.log" 2>&1; c=$?; log "install-home exit $c"
[ "$c" = 0 ] || exit 1
$L "$T/item9.sh" > "$T/item9.outer.log" 2>&1; c=$?; log "item9 exit $c"
log "setup-all done"
