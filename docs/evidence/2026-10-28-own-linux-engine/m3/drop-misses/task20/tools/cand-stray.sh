#!/bin/bash
# cand-stray.sh: the candidates against the mechanism, in vitro: cold short drops in front after the gate's prelude,
# the real pointer nudged in the press window (STRAY, default nudge:1), on the scratch engine with each candidate as a
# lane: cua (none), atomic (press through the threshold under one server grab), watch (the engine sees the real
# pointer's events), first4 (the first motion straight to 4 px), b50 (the first step to 4 px, then up to 50 ms for the
# take, Chromium only). TRIALS a lane (default 10). Output under task20/runs/cand-stray-<name>/.
T=/Users/new/.local/share/cua-171/task20
ENGINE=$T/cua-engine-proto TRIALS=${TRIALS:-10} LANES=cua,cua:atomic,cua:watch,cua:first4,cua:b50 "$T/run-cold.sh" "cand-stray-${1:-nudge1}" \
  --prelude dedicated --stray "${STRAY:-nudge:1}" \
  --variant "atomic=--drag-atomic-press" \
  --variant "watch=--drag-stray-watch" \
  --variant "first4=--drag-first-step-px 4" \
  --variant "b50=--drag-first-step-px 4 --drag-take-wait-ms 50"
