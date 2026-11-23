#!/bin/bash
# Task 118 on arm64 (ruling 898.3's residue check, and ruling 907's additions): the linux-engine 0.4.2 candidate
# (80b98959). Every run a development run under the host lock (holder m5-tail042, 45 min cap), hold-sittings checked
# before each; a run that fails is logged and the chain goes on. Each run's Chrome processes recorded (procrec.sh).
# chain2.sh: chain.sh with the checkout from $W (wave 4: t118-wave4) and the parts v5w4-<156|158>-<k> (ruling 908)
# usage: chain2.sh <candidate engine> <part>...
#   v5-<156|158>-<k>  V5's two cells (the in-front short drop and the cancel cell), the candidate alone, default lane,
#                     twice the load, private display, BLOCKS blocks (25), as task 116 ran them; 158: T7's extracted copy
#                     first on PATH (the held 156 left alone)
#   k1-<n>, k2-<n>    the gate's canary steps K1 (installed Chrome 156) and K2 (current stable, 158) in gate form:
#                     gate.mjs run, --dev, idle, private display, the engine sandboxed by the run-owned home's helper
set -u
D=/Users/new/.local/share/cua-171
T=$D/task118
W=${W:-/Users/new/Developer/GitHub/cua/.claude/worktrees/t116-measure042}
NODE=$D/node24/bin/node
VENDOR=$D/m5/home-arm64-041/runtimes/26.928.40906-linux-arm64/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_arm64
NEWEST=$D/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_arm64
C158=$D/chrome-stable/158.0.8127.36-1/bin
CAND=$1; shift
BLOCKS=${BLOCKS:-25}
export PATH=$D/node24/bin:$PATH
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$T/chain.log"; }
run() {
  local name=$1; shift
  [ -e "$D/hold-sittings" ] && { log "hold-sittings present: $name not started; chain stopped"; exit 5; }
  [ -e "$T/procs/$name.txt" ] && { log "$name exists: skipped"; return 0; }
  log "start $name load=$(cut -d' ' -f1-3 /proc/loadavg) chrome=$(google-chrome --version 2>&1)"
  : > "$T/procs/$name.txt"
  "$T/scripts/procrec.sh" $BASHPID "$T/procs/$name.txt" &
  local rec=$!
  "$@" > "$T/runs/$name.out" 2>&1
  local code=$?
  kill "$rec" 2>/dev/null; wait "$rec" 2>/dev/null
  log "end $name exit $code load=$(cut -d' ' -f1-3 /proc/loadavg)"
  return 0
}
locked() { "$D/locked.sh" m5-tail042 timeout -s TERM -k 60 45m "$@"; }
for part in "$@"; do
  kind=${part%%-*}
  case $part in
    v5-156-*|v5-158-*|v5w4-156-*|v5w4-158-*)
      ver=${part#*-}; ver=${ver%-*}
      ( [ "$ver" = 158 ] && export PATH=$C158:$PATH
        run "$part" locked "$NODE" "$T/scripts/private-run.mjs" "$W" "$T/runs/$part" "task 118 development run" --load-factor 2 -- \
          --vendor "$VENDOR" --newest "$NEWEST" --cua "$CAND" --scene device-chrome-dnd \
          --ops chrome_dnd_shared,chrome_dnd_short_in_front_shared --ballast gate --dev --no-audit \
          --blocks "$BLOCKS" --run "m5t042-$part" ) || exit $? ;;
    k1-*|k2-*)
      step=K${kind#k}
      ( export CUA_HOME=$T/home
        run "$part" locked "$NODE" "$W/scripts/linux-engine-gate/gate.mjs" run "$step" --candidate "$CAND" \
          --out "$T/canary/$part" --dev --holder m5-tail042 --vendor "$VENDOR" --newest "$NEWEST" ) || exit $? ;;
    *) log "unknown part $part"; exit 2 ;;
  esac
done
log "chain done"
