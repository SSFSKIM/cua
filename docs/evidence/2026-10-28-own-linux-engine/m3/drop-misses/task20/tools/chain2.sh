#!/bin/bash
# chain2.sh: the parked-pointer runs, then the cost run again with paths that keep every effect measurable.
T=/Users/new/.local/share/cua-171/task20
"$T/park.sh"
export DISPLAY=:0 XAUTHORITY=/Users/new/.Xauthority
rm -f "$T/runs/cost2.jsonl"
CUA_BIN=$T/cua-engine-proto node "$T/cost.mjs" "$T/runs/cost2.jsonl" "${COST_TRIALS:-12}" \
  "base=" \
  "atomic=--drag-atomic-press" \
  "atomic+watch=--drag-atomic-press --drag-stray-watch" \
  "first4=--drag-first-step-px 4" \
  "b50=--drag-first-step-px 4 --drag-take-wait-ms 50" \
  "a50=--drag-first-step-px 4 --drag-take-wait-ms 50 --drag-take-wait-all" \
  "cmin150=--drag-min-ms 150" > "$T/runs/cost2.log" 2>&1
echo "cost2 exit $?"
