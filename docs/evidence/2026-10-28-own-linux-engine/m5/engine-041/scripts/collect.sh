#!/bin/bash
# Task 101: one run's records copied into the evidence: its README, step.json, summary, the t101 table and its rows
# (gzip). usage: collect.sh <run dir (holds run/)> <t101 table> <evidence dir>
set -eu
RUN=$1; TABLE=$2; DEST=$3
mkdir -p "$DEST"
for f in README.md step.json; do [ -e "$RUN/$f" ] && cp "$RUN/$f" "$DEST/"; done
cp "$RUN/run/summary.md" "$DEST/"
cp "$TABLE" "$DEST/t101.md"
gzip < "$RUN/run/results.jsonl" > "$DEST/results.jsonl.gz"
ls -la "$DEST"
