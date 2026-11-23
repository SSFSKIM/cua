#!/bin/bash
# Task 99 (T7; from task 89's and task 96's copy-evidence.sh), run on the x64 host: the arm64 counted step directories
# copied from the VM's out root into the evidence (m5/arm64/out/), raw rows included (every vendor series, items 12 and
# 13); each file over 1 MB gzipped as the m4 evidence keeps its traces; sockets, the guard's decoy directories, STOP
# files and pidfiles left out. Task 99's launchers and records beside them in scripts/ (no secret is read or held by
# any): the setup and home logs, the local proof's logs, item 9's transcript (the fresh home as <fresh>) and its private
# desktop's session record, and the host lock's t7-arm64 lines.
set -u
VM=cua-171-arm64
D=/Users/new/.local/share/cua-171
T=$D/task99
DST=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m5/arm64
STAGE=$T/vm-copy
rm -rf "$STAGE"; mkdir -p "$STAGE"
X='--exclude decoy/ --exclude *.sock --exclude STOP --exclude *.pid'
rsync -a --no-specials --no-devices $X "$VM:$D/m5/out-arm64/" "$STAGE/out/"
rsync -a --no-specials --no-devices --exclude 'vm-copy/' --exclude 'local/' --exclude 'item9/desktop/' "$VM:$T/" "$STAGE/scripts/"
rsync -a "$VM:$T/item9/desktop/session.json" "$STAGE/scripts/item9/" 2>/dev/null
scp -q "$VM:$D/host-lock.log" "$STAGE/host-lock.log"
rm -rf "$DST/out" "$DST/scripts"
mkdir -p "$DST"
cp -a "$STAGE/out" "$DST/out"
cp -a "$STAGE/scripts" "$DST/scripts"
# the x64 host's own copies of the launchers (the waits run from here)
cp "$T/wait-vm.sh" "$T/wait-drive.sh" "$T/copy-evidence.sh" "$T/scan-evidence.sh" "$DST/scripts/" 2>/dev/null
grep ' t7-arm64 ' "$STAGE/host-lock.log" > "$DST/scripts/lock-lines.txt"
find "$DST/out" "$DST/scripts" -type f -size +1M ! -name '*.gz' -print0 | xargs -0 -r gzip -9
find "$DST/out" "$DST/scripts" -type s -delete 2>/dev/null
du -sh "$DST/out" "$DST/scripts"; find "$DST/out" "$DST/scripts" -type f -size +5M | head
