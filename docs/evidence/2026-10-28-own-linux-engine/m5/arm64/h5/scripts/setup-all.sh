#!/bin/bash
# Task 109: the setup at H5 = 7d554dea, each part its own hold of the host lock (holder task109-arm64): the H5 checkout
# (t109-h5, fresh, detached; npm ci, electron, xprobe), the reused 0.4.1 acceptance home's check, Chrome read again.
# Then H5's local proof as the brief scopes it: the harness suite and harness-dbus (H5 changes only the harness's
# judges and the audit's recording; ci-gate covered the rest). Logs beside this script, the proof's under proof/.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task109
W=/Users/new/Developer/GitHub/cua/.claude/worktrees
H5=7d554dea958a9c9a0b7a6c254365945cf1f18cd4
L="$D/locked.sh task109-arm64"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$T/setup-all.log"; }
[ -e "$D/hold-sittings" ] && { log "hold-sittings present"; exit 5; }
$L "$T/setup.sh" t109-h5 "$H5" > "$T/setup-h5.log" 2>&1; c=$?; log "setup t109-h5 exit $c"
[ "$c" = 0 ] || exit 1
$L "$T/home-check.sh" > "$T/home-check.log" 2>&1; c=$?; log "home-check exit $c"
G=$W/t109-h5 "$T/chrome-check.sh" > "$T/chrome-check.log" 2>&1; c=$?; log "chrome-check exit $c"
export PATH=$D/node24/bin:$D/bin:/Users/new/.cargo/bin:$PATH
PROOF_LOCK="$L" PROOF_HOLD=$D/hold-sittings PROOF_PARTS=harness,harness-dbus \
  "$W/t109-h5/scripts/linux-engine-gate/local-proof.sh" "$T/proof" "$W/t109-h5" > "$T/proof.out" 2>&1
c=$?; log "proof exit $c"
log "setup-all done"
