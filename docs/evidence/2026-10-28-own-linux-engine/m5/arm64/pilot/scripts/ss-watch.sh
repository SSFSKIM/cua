#!/bin/bash
# Task 96 (the controller's word): a read-only observer beside the V5 rerun, outside the guard. Every 0.2 s it reads
# `ss -xapn` and keeps each line that names an autobind-shaped abstract address (@ and five hex digits), with the time,
# so that if wrap71 flags a peer like V5's "@011e2" again, who held that address may be on record. It stops when the
# file <stop> exists. usage: ss-watch.sh <log> <stop file>
LOG=$1; STOP=$2
: > "$LOG"
while [ ! -e "$STOP" ]; do
  t=$(date -u +%T.%3N)
  ss -xapn 2>/dev/null | grep -E '@[0-9a-f]{5}([^0-9a-f]|$)' | sed "s/^/$t /" >> "$LOG"
  sleep 0.2
done
