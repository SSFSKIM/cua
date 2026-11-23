#!/bin/bash
# Task 123: V5's sitting on the relayed GO (ruling 939): wait until 02:30:00Z, wait for task 123's private drivers to
# have ended, read the precheck (precheck-zero.sh, recorded) and refuse unless every precondition holds, wait up to
# 10 min for the 1-minute load below 1.0, then launch run-sitting.sh for V5 alone. Any refused precondition exits 3
# with the reason, and nothing starts on :0.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task123
OUT=$D/m5/zero-x64-h6
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$T/go-v5.log"; }
open=$(date -u -d '2026-11-21T02:30:00Z' +%s)
log "go-v5 armed; waits for 02:30:00Z"
while [ "$(date +%s)" -lt "$open" ]; do sleep 5; done
# task 123's private drivers must have ended (none of their steps runs beside :0)
while pgrep -f "$T/drive.sh" > /dev/null; do
  [ "$(date +%s)" -gt $(( open + 30 * 60 )) ] && { log "a private driver still runs at 03:00Z: not started"; exit 3; }
  sleep 10
done
"$T/precheck-zero.sh" > "$T/zero-precheck.out" 2>&1
P=$T/zero-precheck.out
refuse() { log "precheck refused: $*"; exit 3; }
grep -q '^hold-sittings: absent$' "$P" || refuse "hold-sittings"
grep -q '^stress-ng: none$' "$P" || refuse "stress-ng"
grep -q '^owner chrome: *2546101 .*chrome$' "$P" || refuse "the owner's Chrome is not pid 2546101 as planned"
grep -q '^/tmp/cua171-run-\* present: \[\]$' "$P" || refuse "/tmp/cua171-run-* present"
grep -q "^firefox on PATH (sitting.sh): $D/task59/bin/firefox$" "$P" || refuse "firefox on PATH"
grep -q '^google-chrome: Google Chrome 156.0.8078.73' "$P" || refuse "google-chrome version"
grep -q '^pointer: x:' "$P" || refuse "the pointer unread"
free=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
[ "$free" -gt 20 ] || refuse "only ${free}G free (ruling 937)"
grep '^gate leftovers:' "$P" | grep -qE '^gate leftovers: end check: clear *$' || refuse "gate leftovers: $(grep '^gate leftovers:' "$P")"
start=$(date +%s)
until awk -v l="$(cut -d' ' -f1 /proc/loadavg)" 'BEGIN{exit !(l < 1.0)}'; do
  [ $(( $(date +%s) - start )) -gt 600 ] && refuse "the 1-minute load stayed at 1.0 or more for 10 min"
  sleep 10
done
log "precheck passed (load $(cut -d' ' -f1-3 /proc/loadavg)); launching V5"
"$T/run-sitting.sh" "" "$OUT" V5
c=$?
log "run-sitting exit $c"
exit $c
