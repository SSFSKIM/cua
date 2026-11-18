#!/bin/bash
# Task 96 (ruling 810, the controller's word): R1's three arm64 vendor outcomes (native/app/typetext, native/app/paste,
# native/target-app-decorated-tab/getaxstate/minimized) rerun 3 times on the pinned 26.928.40906-linux-arm64, as
# development runs. repl-parity has no single-case selection, so each rerun is the R1 parity part's vendor lane whole,
# as suites.sh runs it: on its own private desktop (M4's private-desktop.mjs --session), prepared --native-only at the
# checkout's head, the prepared home checked by the pinned rule, then `repl-parity.mjs run --suite native --host cua
# --engine vendor`, then cleanup. No cua lane and no diff: cua's 34/34 stands. Each rerun under its own host-lock hold.
# usage: vendor-reruns.sh <n>            (outer: the n reruns, each locked)
#        vendor-reruns.sh inner <dir>    (inside the private desktop)
set -u
D=/Users/new/.local/share/cua-171
WT=/Users/new/Developer/GitHub/cua/.claude/worktrees/t96-arm64
FACADE=$WT/docs/evidence/2026-10-28-own-linux-engine/m4/facade/scripts
export PATH=$D/node24/bin:$PATH
DEVICE=cua-171-arm64
OUT=$D/m5/pilot-arm64/vendor-reruns
cd "$WT" || exit 2
if [ "${1:-}" = inner ]; then
  R=$2
  log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$R/rerun.log"; }
  export CUA_PARITY_SCRATCH_PREFIX=cua-m5-
  SHA=$(git rev-parse HEAD)
  node scripts/repl-parity.mjs cleanup-prepared --device "$DEVICE" > "$R/cleanup-before.out" 2>&1 || true
  node scripts/repl-parity.mjs prepare --device "$DEVICE" --commit "$SHA" --native-only > "$R/prepare.json" 2> "$R/prepare.err" || { log "prepare failed"; exit 1; }
  PHOME=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).ownedPreparation.home)' "$R/prepare.json")
  node "$WT/scripts/linux-engine-gate/gate.mjs" check --pinned "$PHOME" > "$R/pinned.txt" 2>&1; c=$?
  log "prepared $PHOME; pinned check exit $c; release $(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).release)' "$R/prepare.json")"
  if [ "$c" -eq 0 ]; then
    node scripts/repl-parity.mjs run --device "$DEVICE" --suite native --host cua --engine vendor --out "$R/vendor" > "$R/vendor.out" 2>&1
    log "vendor exit $? $(tail -1 "$R/vendor.out" | cut -c1-300)"
  fi
  node scripts/repl-parity.mjs cleanup-prepared --device "$DEVICE" > "$R/cleanup.out" 2>&1; log "cleanup exit $?"
  exit 0
fi
n=${1:-3}
mkdir -p "$OUT"
for i in $(seq 1 "$n"); do
  R=$OUT/rerun-$i
  [ -e "$R" ] && { echo "$R exists"; exit 2; }
  mkdir -p "$R"
  echo "$(date -u +%FT%TZ) rerun $i start" | tee -a "$OUT/reruns.log"
  # the private desktop's out directory holds its session bus socket, so it is short (/tmp), as suites.sh's LOGS is;
  # a first attempt under $R failed with dbus-daemon's "Socket name too long" (attempt-1/)
  S=$(mktemp -d /tmp/t96vr-XXXXXX)
  "$D/locked.sh" t96-arm64 timeout -s TERM -k 120 40m node "$FACADE/private-desktop.mjs" --harness "$WT" --out "$S/desktop" --session -- "$0" inner "$R" > "$R/outer.out" 2>&1
  code=$?
  cp -a "$S/desktop" "$R/desktop" 2>/dev/null; rm -rf "$S"
  echo "$(date -u +%FT%TZ) rerun $i end exit $code $(tail -1 "$R/outer.out" | cut -c1-200)" | tee -a "$OUT/reruns.log"
done
