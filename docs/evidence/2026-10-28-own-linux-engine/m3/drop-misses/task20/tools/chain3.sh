#!/bin/bash
# chain3.sh: which Chromium drags still take with the real pointer outside the window (parked on the front window).
T=/Users/new/.local/share/cua-171/task20
export DISPLAY=:0 XAUTHORITY=/Users/new/.Xauthority
rm -f "$T/runs/cost-park-outside.jsonl"
PARK=1170,715 CUA_BIN=$T/cua-engine-proto node "$T/cost.mjs" "$T/runs/cost-park-outside.jsonl" "${PARK_TRIALS:-6}" \
  "base=" "atomic=--drag-atomic-press" > "$T/runs/cost-park-outside.log" 2>&1
echo "park cost exit $?"
