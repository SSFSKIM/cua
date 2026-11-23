#!/bin/bash
# Task 99 (T7): the whole setup, each part its own hold of the host lock (holder t7-arm64): the T7 checkout at H''',
# main's comparison checkout (for ruling 743's npm test comparison; no xprobe), the acceptance home's own install, then
# Chrome (F2) read. Logs beside this script.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task99
H3=f6275fb600ae719f29cf32b206676e1a70a02e26
L="$D/locked.sh t7-arm64"
[ -e "$D/hold-sittings" ] && { echo "hold-sittings present"; exit 5; }
$L "$T/setup.sh" t7-arm64 "$H3" > "$T/setup-t7.log" 2>&1; echo "$(date -u +%FT%TZ) setup t7-arm64 exit $?" | tee -a "$T/setup-all.log"
$L env NO_XPROBE=1 "$T/setup.sh" t7-main origin/main > "$T/setup-main.log" 2>&1; echo "$(date -u +%FT%TZ) setup t7-main exit $?" | tee -a "$T/setup-all.log"
$L "$T/install-home.sh" > "$T/install-home.log" 2>&1; echo "$(date -u +%FT%TZ) install-home exit $?" | tee -a "$T/setup-all.log"
"$T/chrome-check.sh" > "$T/chrome-check.log" 2>&1; echo "$(date -u +%FT%TZ) chrome-check exit $?" | tee -a "$T/setup-all.log"
echo "$(date -u +%FT%TZ) setup-all done" | tee -a "$T/setup-all.log"
