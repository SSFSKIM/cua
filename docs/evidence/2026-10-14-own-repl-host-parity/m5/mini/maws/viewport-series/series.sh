#!/bin/bash
# The viewport series (session ruling after attempt 1's 800x500): vendor, own, vendor, own, vendor, own on the mini. Each
# slot gets a fresh managed `cua install` scratch home (CUA_NODE unset), waits for two consecutive idle checks 30 s apart,
# then runs probe.sh (its own idle gate at start and pre-launch, a 5 s overlap watcher, a clean-quit and ps check). A slot
# whose start is refused (exit 3) or that saw an overlap is not counted and is rerun with a fresh home.
#   series.sh
export PATH=$HOME/.nvm/versions/node/v24.18.0/bin:/opt/homebrew/bin:$PATH
unset CUA_NODE
D=$HOME/.local/share/cua-parity-maws; S=$D/out/viewport-series; mkdir -p "$S"
waitidle() { local ok=0; for i in $(seq 1 480); do if $D/gate.sh "$1" >> "$S/wait.txt"; then ok=$((ok+1)); [ $ok -ge 2 ] && return 0; else ok=0; fi; sleep 30; done; return 1; }
if [ ! -f $D/688fb0e3/out/main/index.js ]; then
  waitidle build || { echo "never idle for the build" > "$S/DONE"; exit 4; }
  (cd $D/688fb0e3 && pnpm install --frozen-lockfile && pnpm build) > $D/out/install-build.txt 2>&1 || { echo "build failed" > "$S/DONE"; exit 5; }
  $D/gate.sh post-build >> "$S/wait.txt"
fi
n=0
for host in vendor cua vendor cua vendor cua; do
  n=$((n+1)); counted=no
  for try in 1 2 3 4; do
    name=$n-$host-try$try
    H=$(mktemp -d $D/cua-home-XXXXXX); mkdir -m 700 "$H/home"
    (cd $HOME/Developer/GitHub/cua-parity && env -u CUA_NODE CUA_HOME="$H" HOME="$H/home" node bin/cua.mjs install --json > "$S/$name.install.json" 2> /dev/null) || { echo "install failed at $name" > "$S/DONE"; exit 6; }
    echo "$H" > "$S/$name.home.txt"
    waitidle "$name:wait" || { echo "never idle at $name" > "$S/DONE"; exit 4; }
    $D/probe.sh "viewport-series/$name" "$H" "$host" > "$S/$name.probe.txt" 2>&1
    rc=$?
    if [ $rc -eq 3 ] || [ -f "$S/$name/overlap.txt" ]; then echo "$name not counted (rc=$rc)" >> "$S/slots.txt"
    else echo "$name counted (rc=$rc)" >> "$S/slots.txt"; counted=yes; fi
    [ $host = cua ] && [ -f "$S/$name/attest-cua.jsonl" ] && node $D/attest/attest-summary.mjs "$S/$name/attest-cua.jsonl" 0.5.0 "$(git -C $HOME/Developer/GitHub/cua-parity rev-parse HEAD)" "$H" > "$S/$name/attest-cua-summary.json"
    python3 -c "import json,sys;d=json.load(open('$S/$name/maws-live-$host.json'));v=d.get('features',{}).get('details',{}).get('viewport');print('$name',d['verdict']['status'],v and v.get('during'))" >> "$S/viewport.txt" 2>/dev/null
    rm -rf "$H"
    [ $counted = yes ] && break
  done
  [ $counted = yes ] || { echo "slot $n never counted" > "$S/DONE"; exit 7; }
done
open -a Terminal
echo ok > "$S/DONE"
