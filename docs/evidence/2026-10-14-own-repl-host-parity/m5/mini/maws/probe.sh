#!/bin/bash
# One M5 MAWS live probe attempt on the mini: idle gate, Terminal front, idle re-check, the unchanged probe from the parity
# clone with the M5 attestation recorder, an overlap watcher every 5 s, then Terminal front again and a process check.
#   probe.sh <attempt-name> <CUA_HOME> [cua|vendor]
export PATH=$HOME/.nvm/versions/node/v24.18.0/bin:/opt/homebrew/bin:$PATH
unset CUA_NODE
D=$HOME/.local/share/cua-parity-maws
name=$1; H=$2; HOST=${3:-cua}; O=$D/out/$name; mkdir -p "$O"
MAWS=$D/688fb0e3
$D/gate.sh "$name:start" >> "$O/gate.txt" || { echo NOT-IDLE-AT-START; exit 3; }
open -a Terminal
sleep 2
$D/gate.sh "$name:pre-launch" >> "$O/gate.txt" || { echo NOT-IDLE-PRE-LAUNCH; exit 3; }
( while :; do $D/gate.sh "$name:during" >> "$O/gate.txt" || echo "OVERLAP" >> "$O/overlap.txt"; sleep 5; done ) &
watcher=$!
cd "$HOME/Developer/GitHub/cua-parity"
env MAWS_CHECKOUT="$MAWS" CUA_HOME="$H" CUA_BROWSER_SERVICE=cua CUA_REPL_HOST=$HOST CUA_SHIM_SURFACES=browser MAWS_E2E_QUIET=1 \
  CUA_ATTEST_OUT="$O/attest-$HOST.jsonl" NODE_OPTIONS="--import=file://$D/attest/attest-serve.mjs" \
  node docs/evidence/2026-10-13-own-browser-service-parity/m4/maws-live/run.mjs --out "$O/maws-live-$HOST.json" 2> "$O/probe-stderr.txt"
rc=$?
kill $watcher; wait $watcher 2>/dev/null
$D/gate.sh "$name:end" >> "$O/gate.txt"
echo "probe exit=$rc" > "$O/exit.txt"
open -a Terminal
sleep 3
{ echo "$(date -u +%FT%TZ) processes whose command names the scratch MAWS clone or Electron:"; ps -axww -o pid=,ppid=,command= | grep -E "cua-parity-maws/688fb0e3|Electron\.app/Contents/MacOS/Electron|mcua-m4-" | grep -v grep || echo "(none)"; } > "$O/ps-after.txt"
echo "rc=$rc"; cat "$O/ps-after.txt"; tail -2 "$O/gate.txt"; [ -f "$O/overlap.txt" ] && echo "OVERLAP SEEN" || echo "no overlap"
