#!/bin/bash
set -eu
printf '[%s] ' "${1:-posture}"; date -u '+%Y-%m-%dT%H:%M:%SZ'
uptime
printf 'vncEstablished='; netstat -an -p tcp | awk '$0 ~ /[.:]5900[[:space:]]/ && /ESTABLISHED/ {n++} END {print n+0}'
for p in $(pgrep -f cua-shim.mjs || true); do printf 'shim=%s children=' "$p"; pgrep -P "$p" | tr '\n' ' ' || true; echo; done
for name in Runner.Worker TextEdit SkyComputerUseService ChatGPT SecurityAgent cua-engine 'cua Engine'; do printf '%s=' "$name"; pgrep -x "$name" | tr '\n' ' ' || true; echo; done
printf 'tartGuestCommands='; ps -axo command= | awk '$1 ~ /(^|\/)tart$/ && ($2 == "run" || $2 == "exec") {print}'
tart list
printf 'authStatus='; pgrep -f 'claude auth status' | tr '\n' ' ' || true; echo
lsappinfo info -only bundleid "$(lsappinfo front)"
defaults read com.apple.HIToolbox AppleCurrentKeyboardLayoutInputSourceID
defaults read com.apple.HIToolbox AppleGlobalTextInputProperties
for k in ShowSidebar ShowStatusBar ShowPathbar; do printf '%s=' "$k"; defaults read com.apple.finder "$k" 2>/dev/null || echo unset; done
printf 'engineConfigMtime='; stat -f %m /Users/new/.config/cua/engine.json
printf 'deviceCommit='; git -C /Users/new/Developer/GitHub/cua-parity rev-parse HEAD
git -C /Users/new/Developer/GitHub/cua-parity status --porcelain
for f in live-frontmost.json live-finder.json live-watch.json; do if test -e "/Users/new/Library/Caches/cua-harness/native-matrix/$f"; then echo "retained $f"; else echo "absent $f"; fi; done
cd /Users/new/Developer/GitHub/cua-parity
node scripts/repl-parity/scenes-mac.mjs preflight --run /Users/new/Library/Caches/cua-harness/native-matrix
