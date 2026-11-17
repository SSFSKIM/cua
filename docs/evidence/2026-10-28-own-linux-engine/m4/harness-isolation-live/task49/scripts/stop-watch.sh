#!/bin/bash
# Task 49: while a session runs, a stop condition (wrap.py's flags, owner-watch.sh's change) ends the whole session at
# once, not only the harness run it stopped: SIGTERM to the session (its own handler stops its current phase and
# starts no other). Prints each phase's end and the stop; exits when the session's runner has finished.
# usage: stop-watch.sh <session dir> <runner output file>
out=$1; runner=$2
seen=0
stopped=0
while :; do
  if [ $stopped = 0 ] && { [ -s "$out/flags.jsonl" ] || [ -e "$out/owner-changed" ]; }; then
    s=$(pgrep -f "session.mjs $out" | head -1)
    [ -z "$s" ] && s=$(pgrep -f "session.mjs .*$(basename "$out")/phases.json" | head -1)
    [ -n "$s" ] && kill -TERM "$s"
    echo "STOP CONDITION: session $s sent SIGTERM; flags: $(head -c 400 "$out/flags.jsonl" 2>/dev/null) owner-changed: $([ -e "$out/owner-changed" ] && echo yes || echo no)"
    stopped=1
  fi
  n=$(grep -c "\"phase-end\"" "$out/session.jsonl" 2>/dev/null); n=${n:-0}
  if [ "$n" -gt "$seen" ]; then
    grep '"phase-end"' "$out/session.jsonl" | tail -n +$((seen + 1)) | grep -o '"phase":"[^"]*","ms":[0-9]*,"exit":{[^}]*}' | sed 's/^/phase end: /'
    seen=$n
  fi
  if grep -q '^exit ' "$runner" 2>/dev/null; then echo "session finished: $(grep '^exit ' "$runner")"; exit 0; fi
  sleep 2
done
