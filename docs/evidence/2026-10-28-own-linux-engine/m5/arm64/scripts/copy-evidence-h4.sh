#!/bin/bash
# Task 99 (T7 part 2, at H''''; from copy-evidence.sh), run on the x64 host: the H'''' records copied from the VM into
# the evidence, m5/arm64/h4/: out/ (the counted steps: class A, D1's cross-check, V1 and the twice-load block),
# counter-pilot/ (828(c), uncounted), f2/ (F2's private part on current stable Chrome, uncounted), a872/ (ruling 872's
# activation experiment, uncounted); raw rows included, files over 1 MB gzipped, sockets, decoys, STOP files and
# pidfiles left out. Task 99's part-2 launchers and records go to scripts/ again (copy-evidence.sh's set, refreshed).
set -u
VM=cua-171-arm64
D=/Users/new/.local/share/cua-171
T=$D/task99
DST=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m5/arm64
STAGE=$T/vm-copy-h4
rm -rf "$STAGE"; mkdir -p "$STAGE"
X='--exclude decoy/ --exclude *.sock --exclude STOP --exclude *.pid'
rsync -a --no-specials --no-devices $X "$VM:$D/m5/out-arm64-h4/" "$STAGE/out/"
rsync -a --no-specials --no-devices $X "$VM:$D/m5/pc-arm64/" "$STAGE/counter-pilot/"
rsync -a --no-specials --no-devices $X "$VM:$D/m5/f2-arm64/" "$STAGE/f2/"
rsync -a --no-specials --no-devices $X "$VM:$D/m5/a872/" "$STAGE/a872/"
rsync -a --no-specials --no-devices --exclude 'vm-copy*/' --exclude 'local/' --exclude 'item9/desktop/' "$VM:$T/" "$STAGE/scripts/"
rsync -a "$VM:$D/hold-sittings-cleared-2026-11-18T23-36Z.txt" "$STAGE/" 2>/dev/null
rsync -a "$VM:$D/chrome-stable/index/" "$STAGE/chrome-158-index/" 2>/dev/null
scp -q "$VM:$D/host-lock.log" "$STAGE/host-lock.log"
rm -rf "$DST/h4" "$DST/scripts"
mkdir -p "$DST/h4"
cp -a "$STAGE/out" "$STAGE/counter-pilot" "$STAGE/f2" "$STAGE/a872" "$DST/h4/"
[ -e "$STAGE/hold-sittings-cleared-2026-11-18T23-36Z.txt" ] && cp "$STAGE/hold-sittings-cleared-2026-11-18T23-36Z.txt" "$DST/h4/"
mkdir -p "$DST/h4/chrome-158-index" && cp "$STAGE"/chrome-158-index/{InRelease,Packages,stable.txt} "$DST/h4/chrome-158-index/" 2>/dev/null
cp -a "$STAGE/scripts" "$DST/scripts"
cp "$T/wait-vm.sh" "$T/wait-drive.sh" "$T/copy-evidence.sh" "$T/copy-evidence-h4.sh" "$T/scan-evidence.sh" "$T/compare-drag.mjs" "$DST/scripts/" 2>/dev/null
cp "$T/l3b-keyup-302-check.txt" "$T/l3cd-confirmation-check.txt" "$DST/h4/" 2>/dev/null
grep ' t7-arm64 ' "$STAGE/host-lock.log" > "$DST/scripts/lock-lines.txt"
find "$DST/h4" "$DST/scripts" -type f -size +1M ! -name '*.gz' -print0 | xargs -0 -r gzip -9
find "$DST/h4" "$DST/scripts" -type s -delete 2>/dev/null
du -sh "$DST/h4" "$DST/scripts"; find "$DST/h4" "$DST/scripts" -type f -size +5M | head
