#!/bin/bash
# Task 147 (from task 136's copy-h8.sh): the H9 arm64 steps copied from the VM into the evidence
# (engine-044/reach/arm64/out/, the step dirs with their raw rows, route-audit traces left out, files over 1 MB gzipped,
# logs kept as .log.txt, decoy sockets and pidfiles left out), the launchers and records into scripts/, and the host
# lock's h9-arm64 lines.
set -u
VM=cua-171-arm64
D=/Users/new/.local/share/cua-171
T=$D/task147
DST=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/h9-reach-arm64/docs/evidence/2026-10-28-own-linux-engine/engine-044/reach/arm64
X='--exclude decoy/ --exclude *.sock --exclude STOP --exclude *.pid'
rm -rf "$DST"; mkdir -p "$DST"
rsync -a --no-specials --no-devices $X --exclude 'run/audit-traces/' "$VM:$D/m5/out-arm64-h9/" "$DST/out/"
rsync -a --no-specials --no-devices --exclude 'out/' --exclude 'bin/' "$VM:$T/" "$DST/scripts/"
scp -q "$VM:$T/bin/off-044" "$DST/scripts/off-044"
scp -q "$VM:$D/host-lock.log" "$T/host-lock-h9.log"
grep -a ' h9-arm64 ' "$T/host-lock-h9.log" > "$DST/scripts/lock-lines.txt"
find "$DST" -type f -name '*.log' -exec mv {} {}.txt \;
find "$DST" -type f -size +1M ! -name '*.gz' -print0 | xargs -0 -r gzip -9
find "$DST" -type s -delete 2>/dev/null
du -sh "$DST"/*
