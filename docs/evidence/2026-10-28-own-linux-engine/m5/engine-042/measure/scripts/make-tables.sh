#!/bin/bash
# Task 116: every joined sample file and table from one host's runs, into task116/out/<host>/ (counts, ids and times).
# fdaff715's runs stand for release timing (sampler on and off), the watch, the cost and the idle checks; wave 2's
# (313167a9) for the pings: the predictor and the adaptive tables.
# usage: make-tables.sh <x64|arm64> <checkout>
set -u
[ -d /Users/new/.local/share/cua-171/node24/bin ] && export PATH=/Users/new/.local/share/cua-171/node24/bin:$PATH
T=/Users/new/.local/share/cua-171/task116
S=$T/scripts
H=$1; W=$2
O=$T/out/$H
mkdir -p "$O"
j() { local out=$1 arch=$2 load=$3; shift 3; local d=(); for x in "$@"; do [ -d "$x/run" ] && d+=("$x"); done
      [ ${#d[@]} -gt 0 ] && python3 -I "$S/join_samples.py" --arch "$arch" --load "$load" --out "$O/$out.jsonl" "${d[@]}" 2>> "$O/join.log"; }
if [ "$H" = x64 ]; then
  F=$T/x64; G=$T/x64-w2
  j fdaff715-v5-l2 x64 2 $F/v5n-2-1 $F/v5n-2-2 $F/v5n-2-3 $F/v5n-2-4
  j fdaff715-d1-l2 x64 2 $F/d1n-2-1
  j fdaff715-v5-l0 x64 0 $F/v5n-0-1 $F/v5n-0-2
  j fdaff715-d-l0 x64 0 $F/d1n-0-1 $F/d2-0-1
  j w2-l2 x64 2 $G/v5-2-1 $G/v5-2-2 $G/d1-2-1 $G/d1-2-2 $G/d2-2-1 $G/d2-2-2 $G/sel-2-1 $G/sel-2-2 $G/edn-2-1
  j w2-l0 x64 0 $G/v5-0-1 $G/sel-0-1 $G/d1-0-1 $G/edn-0-1
  cost=("$F/d1n-0-1/run/results.jsonl" "$F/d2-0-1/run/results.jsonl")
  v5=("$F"/v5n-2-*/run/results.jsonl "$F"/v5n-0-*/run/results.jsonl "$G"/v5-2-*/run/results.jsonl "$G"/v5-0-1/run/results.jsonl)
else
  F=$T/arm64; G=$T/arm64-w2
  j fdaff715-zero arm64:0 0 $F/zero/V5c.development-run
  j fdaff715-d-l0 arm64 0 $F/d1-0-1 $F/d2-0-1
  j w2-l2 arm64 2 $G/v5n-2-1 $G/v5n-2-2 $G/v5-2-1 $G/v5-2-2 $G/d1n-2-1 $G/d1n-2-2 $G/d2-2-1 $G/d2-2-2 $G/sel-2-1 $G/sel-2-2 $G/edn-2-1
  j w2-zero arm64:0 0 $G/zero/V5c.development-run
  j w2-l0 arm64 0 $G/v5-0-1 $G/sel-0-1 $G/d1-0-1 $G/edn-0-1
  j w2-c158-l2 "arm64 Chrome 158" 2 $G/v5-2-c158 $G/sel-2-c158
  j w2-c158-l0 "arm64 Chrome 158" 0 $G/v5-0-c158 $G/sel-0-c158
  cost=("$F/d1-0-1/run/results.jsonl" "$F/d2-0-1/run/results.jsonl")
  v5=("$F"/zero/V5c.development-run/run/results.jsonl "$G"/v5*-2-*/run/results.jsonl "$G"/zero/V5c.development-run/run/results.jsonl "$G"/v5-0-*/run/results.jsonl)
fi
cd "$O" || exit 2
python3 -I "$S/ping_tables.py" fdaff715-*.jsonl > tables-fdaff715.md
python3 -I "$S/ping_tables.py" w2-*.jsonl > tables-w2.md
python3 -I "$S/adaptive.py" w2-*.jsonl > adaptive-w2.md
python3 -I "$S/adaptive.py" fdaff715-*.jsonl > adaptive-fdaff715-pilot.md
: > v5-cells.md; : > infront.md
for f in "${v5[@]}"; do [ -e "$f" ] && { echo "### $f"; python3 -I "$S/analyze_v5.py" "$f"; echo; } >> v5-cells.md; done
for f in "${v5[@]}"; do [ -e "$f" ] && { echo "### $f"; python3 -I "$S/infront_false_oks.py" "$f"; echo; } >> infront.md; done
node "$S/analyze_cost.mjs" "$W" "${cost[@]}" > cost.md
ls -la "$O"
