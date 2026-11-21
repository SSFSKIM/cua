#!/bin/bash
# Task 123: the x64 :0 sitting at H6 on 0.4.2 (V5 alone, ruling 933's window), launched only on the relayed GO. The
# owner's window ends at 08:00Z on 2026-11-21 (the hard stop). The host lock's cap CUA_LOCK_MAX is the whole minutes
# left to it at launch, less 2, so the hold ends by then at worst. V5 is admitted with 55 min (its own cap in
# sitting.sh), so it cannot start past 07:05Z; the brief's latest start is 07:00Z, checked here too.
# usage: run-sitting.sh <suffix> <out root> <step>...   (here: "" .../zero-x64-h6 V5)
set -u
T=/Users/new/.local/share/cua-171/task123
suffix=$1; out=$2; shift 2
hard=$(date -u -d '2026-11-21T08:00:00Z' +%s)
open=$(date -u -d '2026-11-21T02:30:00Z' +%s)
latest=$(date -u -d '2026-11-21T07:00:00Z' +%s)
now=$(date +%s)
[ "$now" -ge "$open" ] || { echo "the owner's window opens at 02:30Z: not started"; exit 7; }
[ "$now" -le "$latest" ] || { echo "past the latest start, 07:00Z: not started"; exit 7; }
left=$(( (hard - now) / 60 - 2 ))
[ "$left" -ge 55 ] || { echo "only $left min left before the hard stop"; exit 7; }
items=(); for s in "$@"; do items+=("$s:55"); done
echo "$(date -u +%FT%TZ) run-sitting: cap ${left}m, hard stop 08:00Z, steps ${items[*]}" >> "$T/run-sitting.log"
"$T/sitting-locked.sh" "${left}m" "$hard" "$suffix" "$out" pinned-release "${items[@]}"
code=$?
echo "$(date -u +%FT%TZ) run-sitting exit $code" >> "$T/run-sitting.log"
exit $code
