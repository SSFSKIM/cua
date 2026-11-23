#!/bin/bash
# Task 122: the setup at H6 = 69bd7993, each part its own hold of the host lock (holder task122-arm64): the H6 checkout
# (t122-h6, fresh, detached; npm ci, electron, xprobe), the fresh 0.4.2 acceptance home (its own `cua install`, the
# engine's sha256, `check --pinned`), Chrome read again, item 9 (the fresh-home install and doctor on a private display),
# then H6's local proof as the brief scopes it: the harness suite and harness-dbus. Logs beside this script, the
# proof's under proof/. It stops at the first part that fails.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task122
W=/Users/new/Developer/GitHub/cua/.claude/worktrees
H6=69bd7993e1f1cb252574939bd6e8e80674bab5b8
L="$D/locked.sh task122-arm64"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$T/setup-all.log"; }
[ -e "$D/hold-sittings" ] && { log "hold-sittings present"; exit 5; }
log "df / avail $(df -BG --output=avail / | tail -1 | tr -d ' ')"
$L "$T/setup.sh" t122-h6 "$H6" > "$T/setup-h6.log" 2>&1; c=$?; log "setup t122-h6 exit $c"
[ "$c" = 0 ] || exit 1
$L "$T/install-home.sh" > "$T/install-home.log" 2>&1; c=$?; log "install-home exit $c"
[ "$c" = 0 ] || exit 1
G=$W/t122-h6 "$T/chrome-check.sh" > "$T/chrome-check.log" 2>&1; c=$?; log "chrome-check exit $c"
$L "$T/item9.sh" > "$T/item9.outer.log" 2>&1; c=$?; log "item9 exit $c"
export PATH=$D/node24/bin:$D/bin:/Users/new/.cargo/bin:$PATH
PROOF_LOCK="$L" PROOF_HOLD=$D/hold-sittings PROOF_PARTS=harness,harness-dbus \
  "$W/t122-h6/scripts/linux-engine-gate/local-proof.sh" "$T/proof" "$W/t122-h6" > "$T/proof.out" 2>&1
c=$?; log "proof exit $c"
log "setup-all done"
