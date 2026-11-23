#!/bin/bash
# x64 V5 at H8 (task 123's go-v5.sh): V5's sitting in the owner's window, 2026-11-23 02:30–08:00Z, started only by
# hand on the relayed GO. It reads the precheck (precheck-zero.sh, recorded, :0's pointer read here and only here) and
# refuses unless every precondition holds, waits up to 10 min for the 1-minute load below 1.0, then launches
# run-sitting.sh for V5 alone (one hold of the host lock, holder h8-x64). A refused precondition exits 3 with the reason,
# and nothing starts on :0.
#   go-v5.sh first                       the first run: waits for 02:30:00Z; out root m5/zero-x64-h8
#   go-v5.sh rerun <kept name> <record>  a whole rerun, started by hand once the design session's ruling allows it: a
#                                        stop clears only on that ruling (its record named as <record>, which must
#                                        exist), and an 823.3/831 rerun only on the controller's decision. The previous
#                                        run's directory is kept, moved to V5.pinned-release.<kept name> (stopped-1,
#                                        run-1, ...), then V5 is printed again (zero-commands-<kept name>.txt) and run.
# The capture sidecar starts by default beside the sitting, never part of it: x64's narrowed copy,
# ~/.local/share/cua-171/bin/flag-capture-narrow.py (rulings 1046, 1047, 1053, 1054: at a flag it writes only the ring's
# and ss-at-flag's lines that name the flagged peer inode or its path, and owners.json; the whole ring is never written).
# It reads only the new run's flags.jsonl, writes only into m5/capture-x64-h8[-<kept name>]/ outside the repository, and
# is stopped by its stop file once the sitting has ended. SIDECAR=0 leaves it out, and nothing else changes.
set -u
D=/Users/new/.local/share/cua-171
T=$D/v5h8
OUT=$D/m5/zero-x64-h8
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$T/go-v5.log"; }
refuse() { log "refused: $*"; exit 3; }
mode=${1:-}
case "$mode" in
  first)
    suffix=""; cap=$D/m5/capture-x64-h8
    [ -e "$OUT/V5.pinned-release/flags.jsonl" ] && refuse "a V5 run already wrote $OUT/V5.pinned-release"
    open=$(date -u -d '2026-11-23T02:30:00Z' +%s)
    log "go-v5 first armed; waits for 02:30:00Z (SIDECAR=${SIDECAR:-1})"
    while [ "$(date +%s)" -lt "$open" ]; do sleep 5; done
    ;;
  rerun)
    kept=${2:?kept name}; record=${3:?the ruling record}
    [ -f "$record" ] || refuse "no ruling record at $record"
    [ -e "$D/hold-sittings" ] && refuse "hold-sittings is present: a stop clears only on the design session's ruling"
    [ -e "$OUT/V5.pinned-release.$kept" ] && refuse "$OUT/V5.pinned-release.$kept exists"
    [ -d "$OUT/V5.pinned-release" ] || refuse "no previous V5 directory to keep"
    mv "$OUT/V5.pinned-release" "$OUT/V5.pinned-release.$kept"
    log "rerun: the previous run kept as V5.pinned-release.$kept; record $record (SIDECAR=${SIDECAR:-1})"
    suffix="-$kept"; cap=$D/m5/capture-x64-h8-$kept
    "$T/print-zero.sh" "$suffix" "$OUT" V5 >> "$T/go-v5.log" 2>&1 || refuse "print V5 failed"
    ;;
  *) echo "usage: go-v5.sh first | rerun <kept name> <ruling record>"; exit 2 ;;
esac
"$T/precheck-zero.sh" > "$T/zero-precheck$suffix.out" 2>&1
P=$T/zero-precheck$suffix.out
grep -q '^hold-sittings: absent$' "$P" || refuse "hold-sittings"
grep -q '^stress-ng: none$' "$P" || refuse "stress-ng"
grep -q '^owner chrome: *2546101 .*chrome$' "$P" || refuse "the owner's Chrome is not pid 2546101 as planned"
grep -q '^/tmp/cua171-run-\* present: \[\]$' "$P" || refuse "/tmp/cua171-run-* present"
grep -q "^firefox on PATH (sitting.sh): $D/task59/bin/firefox$" "$P" || refuse "firefox on PATH"
grep -q '^firefox version: Mozilla Firefox 159' "$P" || refuse "firefox version"
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
sc=""
if [ "${SIDECAR:-1}" = 1 ]; then
  [ -e "$cap" ] && refuse "$cap exists"
  mkdir -p "$cap"
  nice -n 10 python3 -I "$D/bin/flag-capture-narrow.py" --flags "$OUT/V5.pinned-release/flags.jsonl" --out "$cap" --until "$cap/STOP" > "$cap/sidecar.out" 2>&1 &
  sc=$!
  log "sidecar pid $sc started, capture $cap"
fi
log "precheck passed (load $(cut -d' ' -f1-3 /proc/loadavg)); launching V5"
"$T/run-sitting.sh" "$suffix" "$OUT" V5
c=$?
log "run-sitting exit $c"
if [ -n "$sc" ]; then
  touch "$cap/STOP"
  for i in $(seq 1 50); do kill -0 "$sc" 2>/dev/null || break; sleep 0.1; done
  kill -0 "$sc" 2>/dev/null && log "sidecar still running after its stop file"
  wait "$sc" 2>/dev/null; log "sidecar exit $?"
fi
exit $c
