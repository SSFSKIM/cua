#!/bin/bash
# Task 98: this task's runs copied into the branch's evidence directory: from each host's task98/out, every run's
# step.json, logs, session rows and its harness output (summary.md, results.jsonl gzipped), the drivers' logs, and
# this task's scripts. Reads the runs; changes nothing on the VMs.
# usage: collect.sh <evidence dir>   (docs/evidence/2026-10-28-own-linux-engine/m5/l4a-fix in the task's worktree)
set -euo pipefail
DEST=$(realpath -m "$1")
T=/Users/new/.local/share/cua-171/task98
L=/Users/new/.local/share/cua-171/l4a-fix
mkdir -p "$DEST/arm64" "$DEST/x64" "$DEST/scripts/bin" "$DEST/scripts/analysis"
LIST="find . ( -name step.json -o -name README.md -o -name summary.md -o -name results.jsonl -o -name stdout.log -o -name stderr.log -o -name session.jsonl -o -name driver.log -o -name *.driver.out -o -name setup-*.log -o -name *.nohup -o -name openbox.log ) -not -path */apps/* -print0"
ssh cua-171-arm64 "cd $T/out && set -f && $LIST | tar -cf - --null -T -" | tar -xf - -C "$DEST/arm64"
ssh cua-171-arm64 "cat $T/setup.log $T/setup2.log $T/setup3.log 2>/dev/null" > "$DEST/arm64/setup-first.log" || true
(cd "$T/out" && set -f && $LIST | tar -cf - --null -T -) | tar -xf - -C "$DEST/x64"
cp "$L"/out/*.log "$DEST/x64/" 2>/dev/null || true
find "$DEST" -name results.jsonl -exec gzip -9 -f {} +
cp "$L"/bin/* "$DEST/scripts/bin/"
cp "$L"/analysis/*.mjs "$DEST/scripts/analysis/"
cp "$L"/analysis/*.txt "$DEST/scripts/analysis/" 2>/dev/null || true
du -sh "$DEST"
find "$DEST" -type f | wc -l
