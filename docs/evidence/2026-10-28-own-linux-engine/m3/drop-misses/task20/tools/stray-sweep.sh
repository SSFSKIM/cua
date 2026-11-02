#!/bin/bash
# stray-sweep.sh <nudge|popup>: does a pointer event that is not the drag's, arriving during a cold short drop's press,
# make Chrome take the press as a click (the m3-gate miss)? For each offset in OFFSETS (ms after the drag request is
# sent; cua's press comes about 100 ms after it), TRIALS cold drags a lane (LANES, default cua) after the gate's prelude,
# each with the stray event at that offset. Output under task20/runs/stray-<kind>-<offset>/.
T=/Users/new/.local/share/cua-171/task20
kind=${1:-nudge}
for ms in ${OFFSETS:-90 100 105 110 120 140}; do
  TRIALS=${TRIALS:-6} LANES=${LANES:-cua} "$T/run-cold.sh" "stray-$kind-$ms" --prelude dedicated --stray "$kind:$ms"
done
