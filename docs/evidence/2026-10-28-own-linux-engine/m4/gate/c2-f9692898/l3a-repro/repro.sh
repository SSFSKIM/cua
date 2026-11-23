#!/bin/bash
# Task 77, L3a's reproduction (not counted): the settle experiment on candidate 2, chrome-text clipboard_read in the
# background at twice the load, from the frozen gate checkout, a development run; beside it probe-menus.mjs polls the
# run's Chrome application's AT-SPI children. Runs under locked.sh (holder t77-repro).
# usage: [TRIALS=n] repro.sh <out>
set -u
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t77-gate
A=/Users/new/.local/share/cua-171/gate/artifact-c2/cua-engine-0.4.0-linux-x64
D=/Users/new/.local/share/cua-171/task77/l3a-repro
OUT=$1
mkdir -p "$OUT"
node "$D/probe-menus.mjs" "$G" "$OUT" "$OUT/menus.jsonl" > "$OUT/probe.out" 2>&1 &
PROBE=$!
node "$G/scripts/linux-engine-diff.mjs" --experiment settle --lanes shipped --family chrome --kinds clipboard_read --routes background --load-factor 2 --cua "$A" --out "$OUT" --run t77-l3a-repro ${TRIALS:+--trials $TRIALS} > "$OUT/stdout.log" 2> "$OUT/stderr.log"
code=$?
wait $PROBE
echo "settle exit $code; probe exit $?"
exit $code
