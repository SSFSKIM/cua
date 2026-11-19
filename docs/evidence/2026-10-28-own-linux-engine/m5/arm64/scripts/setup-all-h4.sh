#!/bin/bash
# Task 99 (T7 part 2): the setup at H'''' = 3b5c0441, each part its own hold of the host lock (holder t7-arm64): the
# H'''' checkout (t7-h4), main's comparison checkout at today's origin/main (t7-main2; no xprobe), the fresh 0.4.1
# acceptance home's own install, then Chrome read again. Then H''''s local proof as the brief scopes it: the harness
# suite and harness-dbus (the engine source is the released 7522dcb8's, which ci-gate covered), and npm test at
# H'''' and at main for ruling 743's comparison. Logs beside this script, the proof's under proof-h4/.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task99
W=/Users/new/Developer/GitHub/cua/.claude/worktrees
H4=3b5c0441b41e67ab87dd1265d2ca74325f93dec3
L="$D/locked.sh t7-arm64"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$T/setup-all-h4.log"; }
[ -e "$D/hold-sittings" ] && { log "hold-sittings present"; exit 5; }
$L "$T/setup.sh" t7-h4 "$H4" > "$T/setup-h4.log" 2>&1; c=$?; log "setup t7-h4 exit $c"
$L env NO_XPROBE=1 "$T/setup.sh" t7-main2 origin/main > "$T/setup-main2.log" 2>&1; c=$?; log "setup t7-main2 exit $c"
$L "$T/install-home-h4.sh" > "$T/install-home-h4.log" 2>&1; c=$?; log "install-home-h4 exit $c"
G=$W/t7-h4 "$T/chrome-check.sh" > "$T/chrome-check-h4.log" 2>&1; c=$?; log "chrome-check exit $c"
export PATH=$D/node24/bin:$D/bin:/Users/new/.cargo/bin:$PATH
PROOF_LOCK="$L" PROOF_HOLD=$D/hold-sittings PROOF_PARTS=npm-test,npm-test-compare,harness,harness-dbus \
  "$W/t7-h4/scripts/linux-engine-gate/local-proof.sh" "$T/proof-h4" "$W/t7-h4" "$W/t7-main2" > "$T/proof-h4.out" 2>&1
c=$?; log "proof exit $c"
node "$T/failing.mjs" "$T/proof-h4/npm-test.log" "$T/proof-h4/npm-test-compare.log" > "$T/proof-h4/npm-test-compare.txt" 2>&1
log "setup-all-h4 done"
