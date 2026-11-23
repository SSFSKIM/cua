#!/bin/bash
# Task 147, ruling 1140: the development sets copied from the VM into the evidence's dev/ (development, not counted):
# item 3's handle-long, item 4's t487-named and the t14-floor `left` measurement floor-left, each whole (rows, the
# engines' --stats lines, summaries, tables), files over 1 MB gzipped, logs kept as .log.txt; the chain's and the sets'
# logs; the launchers re-synced into scripts/.
set -u
VM=cua-171-arm64
D=/Users/new/.local/share/cua-171
T=$D/task147
B=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/h9-reach-arm64/docs/evidence/2026-10-28-own-linux-engine/engine-044/reach/arm64
DST=$B/dev
X='--exclude decoy/ --exclude *.sock --exclude STOP --exclude *.pid'
rm -rf "$DST"; mkdir -p "$DST"
for s in handle-long t487-named floor-left; do rsync -a --no-specials --no-devices $X --exclude 'run/audit-traces/' "$VM:$T/out/$s/" "$DST/$s/"; done
scp -q "$VM:$T/out/t487-named.driver.out" "$VM:$T/out/dev.log" "$VM:$T/out/chain-1140.log" "$DST/"
rsync -a --no-specials --no-devices --exclude 'out/' --exclude 'bin/' "$VM:$T/" "$B/scripts/"
cp "$T/copy-dev.sh" "$T/copy-h9.sh" "$T/scan-and-tally.sh" "$B/scripts/"
scp -q "$VM:$D/host-lock.log" "$T/host-lock-h9.log"
grep -a ' h9-arm64 ' "$T/host-lock-h9.log" > "$B/scripts/lock-lines.txt"
find "$B" -type f -name '*.log' -exec mv {} {}.txt \;
find "$B" -type f -size +1M ! -name '*.gz' -print0 | xargs -0 -r gzip -9
find "$B" -type s -delete 2>/dev/null
du -sh "$DST"/*
