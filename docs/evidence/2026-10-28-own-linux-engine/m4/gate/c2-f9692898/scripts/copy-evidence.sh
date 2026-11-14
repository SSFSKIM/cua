#!/bin/bash
# Task 77: candidate 2's labelled step directories copied into the evidence (m4/gate/c2-f9692898/), each file over 1 MB
# gzipped as the m4 evidence keeps its traces; sockets and the guard's decoy directories left out (task 76's way).
set -u
SRC=/Users/new/.local/share/cua-171/gate/out-c2
DST=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m4/gate/c2-f9692898
mkdir -p "$DST/out" "$DST/scripts" "$DST/artifact"
rsync -a --no-specials --no-devices --exclude 'decoy/' --exclude '*.sock' --exclude 'STOP' "$SRC/" "$DST/out/"
cp /Users/new/.local/share/cua-171/gate/artifact-c2/attestation.json "$DST/artifact/attestation.json"
for f in drive.sh run-zero2.sh print-zero.sh rejudge.sh setup-gate.sh copy-evidence.sh v5-latetake.py zero-commands.txt zero-V5.out; do
  cp "/Users/new/.local/share/cua-171/task77/$f" "$DST/scripts/$f"
done
find "$DST" -type f -size +1M ! -name '*.gz' -print0 | xargs -0 -r gzip -9
find "$DST" -type s -delete 2>/dev/null
du -sh "$DST"; find "$DST" -type f -size +5M | head
