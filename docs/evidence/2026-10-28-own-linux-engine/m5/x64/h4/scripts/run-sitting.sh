#!/bin/bash
# Task 105: the x64 :0 sitting at H'''' on 0.4.1, launched on a relayed GO. The owner's window ends at 08:00Z on
# 2026-11-19 (the hard stop): CUA_LOCK_MAX is the whole minutes left to it at launch, so the hold ends by then at worst,
# and every step is admitted with 55 min (its own cap in sitting.sh), so none can start that might run past it.
# usage: run-sitting.sh <suffix> <out root> <step>...   (e.g. "" .../zero-x64-h4 V1 V2 V3 V4 Z0 V5)
set -u
T=/Users/new/.local/share/cua-171/task105
suffix=$1; out=$2; shift 2
hard=$(date -u -d '2026-11-19T08:00:00Z' +%s)
left=$(( (hard - $(date +%s)) / 60 ))
[ "$left" -ge 55 ] || { echo "only $left min left before the hard stop"; exit 7; }
items=(); for s in "$@"; do items+=("$s:55"); done
echo "$(date -u +%FT%TZ) run-sitting: cap ${left}m, hard stop 08:00Z, steps ${items[*]}" >> "$T/run-sitting.log"
"$T/sitting-locked.sh" "${left}m" "$hard" "$suffix" "$out" pinned-release "${items[@]}"
code=$?
echo "$(date -u +%FT%TZ) run-sitting exit $code" >> "$T/run-sitting.log"
exit $code
