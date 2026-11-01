#!/bin/bash
# run-blocks.sh <name>: the differential run's own device cases as the gate ran them, cua alone, BLOCKS blocks (default
# 100): each block chrome_dnd_covered_dedicated then chrome_dnd_short_in_front_shared (its cold sample a fresh engine's
# first request, then 2 warm), with task 18's instruments beside it (request-watch listing every motion, cursor-watch).
# OPS overrides the cases; ENGINE cua's binary (default the m3-gate engine). Output under task20/runs/<name>/.
set -u
name=$1
T=/Users/new/.local/share/cua-171/task20
OUT=$T/runs/$name
mkdir -p "$OUT"
export DISPLAY=:0 XAUTHORITY=/Users/new/.Xauthority
X=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/scripts/linux-engine-diff/xprobe/target/release/xprobe
(sleep 36023 | XPROBE_EVERY_MOTION=1 "$X" request-watch > "$OUT/reqwatch.jsonl" 2> "$OUT/reqwatch.err") &
(sleep 36023 | "$X" cursor-watch > "$OUT/cursor.jsonl" 2> "$OUT/cursor.err") &
date -u +%FT%TZ > "$OUT/started"
CUA_BIN=${ENGINE:-/Users/new/.local/share/cua-171/task19/cua-engine-m3} /Users/new/.local/share/cua-171/task16/diff.sh \
  --scene device-chrome-dnd --ops "${OPS:-chrome_dnd_covered_dedicated,chrome_dnd_short_in_front_shared}" \
  --blocks "${BLOCKS:-100}" --out "$OUT/diff" --run "$name" > "$OUT/run.log" 2>&1
code=$?
date -u +%FT%TZ > "$OUT/ended"
echo "$code" > "$OUT/exit"
pkill -f "sleep 36023"
wait
echo "exit $code"
