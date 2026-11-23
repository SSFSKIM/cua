#!/bin/bash
# Task 147, ruling 1143 (c): the two counted #487 runs (t487-named x100 at twice the load, 0.4.4 and 0.4.3) copied from
# the VM into dev/t487-named-w3/ of the h9-487-arm64 checkout, each whole (rows, summaries, wave 3's per-drop table),
# with the setup's and runs' logs and the launchers; files over 1 MB gzipped, logs kept as .log.txt.
set -u
VM=cua-171-arm64
D=/Users/new/.local/share/cua-171
T=$D/task147
DST=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/h9-487-arm64/docs/evidence/2026-10-28-own-linux-engine/engine-044/reach/arm64/dev/t487-named-w3
X='--exclude decoy/ --exclude *.sock --exclude STOP --exclude *.pid'
rm -rf "$DST"; mkdir -p "$DST/scripts"
for v in 044 043; do
  rsync -a --no-specials --no-devices $X --exclude 'run/audit-traces/' "$VM:$T/out/w3-t487-named-$v/" "$DST/$v/"
  scp -q "$VM:$T/out/w3-t487-named-$v.driver.out" "$DST/$v.driver.out"
done
scp -q "$VM:$T/out/w3.log" "$VM:$T/w3-setup.log" "$VM:$T/setup-w3.log" "$VM:$T/w3-check-044.txt" "$DST/"
scp -q "$VM:$T/w3-setup.sh" "$VM:$T/w3-run.sh" "$VM:$T/setup.sh" "$DST/scripts/"
cp "$T/copy-w3.sh" "$DST/scripts/"
scp -q "$VM:$D/host-lock.log" "$T/host-lock-h9.log"
grep -a ' h9-arm64 ' "$T/host-lock-h9.log" | awk '$1 >= "2026-11-23T13:00"' > "$DST/scripts/lock-lines.txt"
find "$DST" -type f -name '*.log' -exec mv {} {}.txt \;
find "$DST" -type f -size +1M ! -name '*.gz' -print0 | xargs -0 -r gzip -9
find "$DST" -type s -delete 2>/dev/null
du -sh "$DST"/*
