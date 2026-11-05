#!/bin/bash
# run-cold.sh <name> [harness args...]: the dnd experiment cold (task 20): the 40 px short drop in front, every drag a
# fresh engine's first request, lanes interleaved (LANES, default pinned,newest,cua; TRIALS a lane, default 20), with
# task 18's instruments beside it: xprobe request-watch listing every motion, cursor-watch and crossing-watch. The selection watch is
# the experiment's own (xdnd_owners). ENGINE: cua's binary (default the m3-gate engine). Output under task20/runs/<name>/.
set -u
name=$1
shift
T=/Users/new/.local/share/cua-171/task20
OUT=$T/runs/$name
mkdir -p "$OUT"
export DISPLAY=:0 XAUTHORITY=/Users/new/.Xauthority
X=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/scripts/linux-engine-diff/xprobe/target/release/xprobe
(sleep 36022 | XPROBE_EVERY_MOTION=1 "$X" request-watch > "$OUT/reqwatch.jsonl" 2> "$OUT/reqwatch.err") &
(sleep 36022 | "$X" cursor-watch > "$OUT/cursor.jsonl" 2> "$OUT/cursor.err") &
(sleep 36022 | "$X" crossing-watch > "$OUT/crossing.jsonl" 2> "$OUT/crossing.err") &
date -u +%FT%TZ > "$OUT/started"
CUA_BIN=${ENGINE:-/Users/new/.local/share/cua-171/task19/cua-engine-m3} /Users/new/.local/share/cua-171/task16/diff.sh \
  --experiment dnd --family chrome --occlusion visible --no-grabs --dnd-short --dnd-cold \
  --trials "${TRIALS:-20}" --lanes "${LANES:-pinned,newest,cua}" "$@" --out "$OUT/diff" --run "$name" > "$OUT/run.log" 2>&1
code=$?
date -u +%FT%TZ > "$OUT/ended"
echo "$code" > "$OUT/exit"
pkill -f "sleep 36022"
wait
echo "exit $code"
