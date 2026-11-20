#!/bin/bash
# Task 116: the committed evidence from both hosts' outputs (counts, ids and times only): tables, joined samples
# (gzipped), chain and sitting logs, the stopped :0 attempt's guard record, and the scripts.
# usage: collect-evidence.sh <evidence dir>
set -eu
T=/Users/new/.local/share/cua-171/task116
E=$1
mkdir -p "$E/x64" "$E/arm64" "$E/scripts" "$E/logs"
cp "$T"/out/x64/*.md "$T/out/x64/join.log" "$E/x64/"
cp "$T"/out/arm64-copy/*.md "$T/out/arm64-copy/join.log" "$E/arm64/"
cp "$T/out/v5-summary.md" "$E/"
for f in "$T"/out/x64/*.jsonl; do gzip -9 -n -c "$f" > "$E/x64/$(basename "$f").gz"; done
for f in "$T"/out/arm64-copy/*.jsonl; do gzip -9 -n -c "$f" > "$E/arm64/$(basename "$f").gz"; done
cp "$T"/scripts/*.sh "$T"/scripts/*.py "$T"/scripts/*.mjs "$E/scripts/"
rm -f "$E/scripts/add-sel.py" "$E/scripts/add-edn.py" "$E/scripts/x64-plan.sh"
cp "$T/x64/chain.log" "$E/logs/x64-fdaff715-chain.log"
cp "$T/x64-w2/chain.log" "$E/logs/x64-w2-chain.log"
A=cua-171-arm64:$T
scp -q "$A/arm64/chain.log" "$E/logs/arm64-fdaff715-chain.log"
scp -q "$A/arm64-w2/chain.log" "$E/logs/arm64-w2-chain.log"
scp -q "$A/arm64/zero/zero.log" "$E/logs/arm64-fdaff715-zero.log"
scp -q "$A/arm64-w2/zero/zero.log" "$E/logs/arm64-w2-zero.log"
scp -q "$A/arm64/stopped-zero-1/V5c.development-run/flags.jsonl" "$E/logs/arm64-stopped-zero-1-flags.jsonl"
scp -q "$A/arm64/stopped-zero-1/V5c.development-run/all-clear.txt" "$E/logs/arm64-stopped-zero-1-all-clear.txt"
# the tables name their inputs by path: kept relative to the task's directory
sed -i "s|$T/||g" "$E"/x64/*.md "$E"/arm64/*.md "$E"/logs/*.log
du -sh "$E"
