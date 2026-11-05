#!/bin/bash
# chain1.sh: the candidates against the nudge (the raw-motion watch included) and the popup, then what each costs.
T=/Users/new/.local/share/cua-171/task20
STRAY=nudge:1 "$T/cand-stray.sh" nudge1-raw
STRAY=popup:1 "$T/cand-stray.sh" popup1
export DISPLAY=:0 XAUTHORITY=/Users/new/.Xauthority
rm -f "$T/runs/cost.jsonl"
CUA_BIN=$T/cua-engine-proto node "$T/cost.mjs" "$T/runs/cost.jsonl" "${COST_TRIALS:-12}" \
  "base=" \
  "atomic=--drag-atomic-press" \
  "watch=--drag-stray-watch" \
  "atomic+watch=--drag-atomic-press --drag-stray-watch" \
  "first4=--drag-first-step-px 4" \
  "b50=--drag-first-step-px 4 --drag-take-wait-ms 50" \
  "a50=--drag-first-step-px 4 --drag-take-wait-ms 50 --drag-take-wait-all" \
  "cmin150=--drag-min-ms 150" > "$T/runs/cost.log" 2>&1
echo "cost exit $?"
