#!/bin/bash
# Task 122: the counted C1 and L4c at H7 copied from the VM into the evidence (m5/arm64/h7/out/, the step dirs raw rows
# included, files over 1 MB gzipped, logs kept as .log.txt), the launchers and records into h7/scripts/, and the host
# lock's task122-arm64 lines from H7's start.
set -u
VM=cua-171-arm64
D=/Users/new/.local/share/cua-171
T=$D/task122
DST=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m5/arm64/h7
X='--exclude decoy/ --exclude *.sock --exclude STOP --exclude *.pid'
rm -rf "$DST"; mkdir -p "$DST/scripts"
rsync -a --no-specials --no-devices $X --exclude 'run/audit-traces/' "$VM:$D/m5/out-arm64-h7/" "$DST/out/"
for f in h7.sh setup.sh setup-h7c.log h7.out h7-2.out late-takes.mjs ident-count.mjs copy-h7.sh; do
  scp -q "$VM:$T/$f" "$DST/scripts/" 2>/dev/null || cp "$T/$f" "$DST/scripts/" 2>/dev/null
done
scp -q "$VM:$D/host-lock.log" "$T/host-lock-h7.log"
awk '$1 >= "2026-11-21T07:48"' "$T/host-lock-h7.log" | grep -a ' task122-arm64 ' > "$DST/scripts/lock-lines.txt"
find "$DST" -type f -name '*.log' -exec mv {} {}.txt \;
find "$DST" -type f -size +1M ! -name '*.gz' -print0 | xargs -0 -r gzip -9
find "$DST" -type s -delete 2>/dev/null
du -sh "$DST"/*
