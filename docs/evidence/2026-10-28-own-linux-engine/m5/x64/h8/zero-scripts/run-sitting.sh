#!/bin/bash
# x64 V5 at H8 (task 123's run-sitting.sh): the :0 sitting, V5 alone, in the owner's window 2026-11-23 02:30–08:00Z,
# launched only through go-v5.sh on the relayed GO. The host lock's cap CUA_LOCK_MAX is the whole minutes left to the
# hard stop (08:00Z) at launch, less 2, so the hold ends by then at worst. V5 is admitted with 55 min (its own cap in
# sitting.sh), and no run starts past 07:00Z, the latest start.
# usage: run-sitting.sh <suffix> <out root> <step>...   ("" .../zero-x64-h8 V5; the rerun: -v5r .../zero-x64-h8 V5)
set -u
T=/Users/new/.local/share/cua-171/v5h8
suffix=$1; out=$2; shift 2
hard=$(date -u -d '2026-11-23T08:00:00Z' +%s)
open=$(date -u -d '2026-11-23T02:30:00Z' +%s)
latest=$(date -u -d '2026-11-23T07:00:00Z' +%s)
now=$(date +%s)
[ "$now" -ge "$open" ] || { echo "the owner's window opens at 02:30Z: not started"; exit 7; }
[ "$now" -le "$latest" ] || { echo "past the latest start, 07:00Z: not started"; exit 7; }
left=$(( (hard - now) / 60 - 2 ))
[ "$left" -ge 55 ] || { echo "only $left min left before the hard stop"; exit 7; }
items=(); for s in "$@"; do items+=("$s:55"); done
echo "$(date -u +%FT%TZ) run-sitting$suffix: cap ${left}m, hard stop 08:00Z, steps ${items[*]}" >> "$T/run-sitting.log"
"$T/sitting-locked.sh" "${left}m" "$hard" "$suffix" "$out" pinned-release "${items[@]}"
code=$?
echo "$(date -u +%FT%TZ) run-sitting$suffix exit $code" >> "$T/run-sitting.log"
exit $code
