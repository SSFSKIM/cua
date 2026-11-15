#!/bin/bash
# #141/#168 Linux scroll probe, isolated: a scratch HOME (its own cua home, an empty claude-secrets, its own Chrome
# user-data dir), Chrome for Testing with cua's extension unpacked on a private Xvfb display, profile `harness` added and
# bound there; then probe.mjs on the gesture tree (old) and the wheel tree (new), idle and with 2 CPU burners per core.
# Stops only what it started (its Xvfb, its Chrome, its burners). Run under the host lock:
#   /Users/new/.local/share/cua-171/locked.sh flakes bash run.sh <trials>
set -u
D=/Users/new/.local/share/cua-171/flakes/linux-scroll
TRIALS=${1:-10}
S=$D/run-$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$S"
# the scratch HOME is short: a cua host socket under it must fit a Unix socket path
H=$(mktemp -d /tmp/c141.XXXX)
mkdir -p "$H/.config/google-chrome" "$H/.config/claude-secrets"
chmod 700 "$H/.config/claude-secrets"
echo "$H" > "$S/home-path"
export HOME=$H
unset CUA_HOME
CFT=$D/cft/chrome-linux64/chrome
NEW=$D/new OLD=$D/old
OUT=$S/trials.jsonl
log() { echo "probe: $*" | tee -a "$S/run.log"; }
PIDS=''
cleanup() { [ -z "$PIDS" ] || kill $PIDS 2> /dev/null; }
trap cleanup EXIT

# a private display: the first free one from :168, never :0
N=168; while [ -e /tmp/.X11-unix/X$N ] || [ -e /tmp/.X$N-lock ]; do N=$((N + 1)); done
Xvfb :$N -screen 0 1280x800x24 -nolisten tcp > "$S/xvfb.log" 2>&1 &
PIDS="$PIDS $!"
export DISPLAY=:$N
for i in $(seq 50); do [ -e /tmp/.X11-unix/X$N ] && break; sleep 0.1; done
log "display $DISPLAY; chrome $("$CFT" --version)"

node "$NEW/bin/cua.mjs" install --json > "$S/install.json" 2> "$S/install.err" || { log "install failed"; exit 1; }
node "$NEW/bin/cua.mjs" chrome register --json > "$S/register.json" 2> "$S/register.err" || { log "register failed"; exit 1; }
"$CFT" --user-data-dir="$HOME/.config/google-chrome" --profile-directory=Default --no-first-run --no-default-browser-check \
  --disable-search-engine-choice-screen --window-size=1280,800 --load-extension="$NEW/extension" about:blank > "$S/chrome.log" 2>&1 &
PIDS="$PIDS $!"
for i in $(seq 60); do [ -d "$HOME/.config/google-chrome/Default" ] && break; sleep 1; done
node "$NEW/bin/cua.mjs" profiles add harness --chrome-profile Default --json > "$S/add.json" 2> "$S/add.err" || { log "profiles add failed"; exit 1; }
live=no
for i in $(seq 45); do
  node "$NEW/bin/cua.mjs" profiles bind harness --dry-run --json > "$S/bind-dry.json" 2> /dev/null
  python3 -I -c "import json,sys; sys.exit(0 if json.load(open(sys.argv[1])).get('backends') else 1)" "$S/bind-dry.json" && { live=yes; break; }
  sleep 2
done
log "live backend: $live"
[ $live = yes ] || exit 1
node "$NEW/bin/cua.mjs" profiles bind harness --json > "$S/bind.json" 2> /dev/null
if ! python3 -I -c "import json,sys; sys.exit(0 if json.load(open(sys.argv[1])).get('ok') else 1)" "$S/bind.json"; then
  id=$(python3 -I -c "import json,sys; b=json.load(open(sys.argv[1]))['backends']; print(b[0]['instanceId'] if len(b)==1 else '')" "$S/bind.json")
  [ -n "$id" ] || { log "no single backend to bind"; exit 1; }
  node "$NEW/bin/cua.mjs" profiles bind harness --extension-instance-id "$id" --json > "$S/bind2.json" 2> /dev/null
fi
node "$NEW/bin/cua.mjs" profiles list --json > "$S/list.json" 2> /dev/null
log "profiles: $(python3 -I -c "import json,sys; print([(p['key'],p['ready']) for p in json.load(open(sys.argv[1]))['profiles']])" "$S/list.json")"

if [ -n "${EXPLORE:-}" ]; then node "$D/explore.mjs" "$NEW" 2>&1 | tee -a "$S/run.log"; exit 0; fi
burn_start() { B=''; for i in $(seq $(( $(nproc) * 2 ))); do yes > /dev/null & B="$B $!"; done; PIDS="$PIDS $B"; log "load: $(( $(nproc) * 2 )) burners on $(nproc) cores"; }
burn_stop() { kill $B 2> /dev/null; B=''; }
for load in ${LOADS:-idle cpu2}; do
  [ $load = cpu2 ] && burn_start
  for route in ${ROUTES:-old new}; do
    tree=$D/$route
    log "route $route ($load)"
    node "$D/probe.mjs" "$tree" "$route-$load" "$TRIALS" "$OUT" 2>> "$S/probe.err"
  done
  [ $load = cpu2 ] && burn_stop
done
log "done: $OUT"
