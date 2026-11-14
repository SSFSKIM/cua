#!/bin/bash
# Task 79 (from task77/copy-evidence.sh): candidate 3's labelled step directories copied into the evidence
# (m4/gate/c3-c55c8e08/), each file over 1 MB gzipped as the m4 evidence keeps its traces; sockets and the guard's decoy
# directories left out (task 76's way); its attestation and task 79's launchers beside them.
set -u
SRC=/Users/new/.local/share/cua-171/gate/out-c3
DST=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m4/gate/c3-c55c8e08
mkdir -p "$DST/out" "$DST/scripts" "$DST/artifact"
rsync -a --no-specials --no-devices --exclude 'decoy/' --exclude '*.sock' --exclude 'STOP' "$SRC/" "$DST/out/"
cp /Users/new/.local/share/cua-171/gate/artifact-c3/attestation.json "$DST/artifact/attestation.json"
for f in setup-gate.sh setup-gate.log drive.sh run-zero2.sh print-zero.sh zero-commands.txt zero-V3.out rejudge.sh step-table.mjs scan-evidence.sh watch.sh copy-evidence.sh rejudge-speed-gap.before-amend.mjs; do
  cp "/Users/new/.local/share/cua-171/task79/$f" "$DST/scripts/$f"
done
find "$DST" -type f -size +1M ! -name '*.gz' -print0 | xargs -0 -r gzip -9
find "$DST" -type s -delete 2>/dev/null
du -sh "$DST"; find "$DST" -type f -size +5M | head
