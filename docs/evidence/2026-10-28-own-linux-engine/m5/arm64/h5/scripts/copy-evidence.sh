#!/bin/bash
# Task 109 (from task 99's copy-evidence.sh), run on the x64 host. (1) Every step's kept route-audit traces
# (run/audit-traces/, rulings 858(b), 863) copied from the VM into ~/.local/share/cua-171/m5/arm64-h5-traces/<out>/<step
# dir>/, never committed, with a sha256 list. (2) The step directories of the H5 out roots (counted, F2's, F3's)
# copied into the evidence (m5/arm64/h5/{out,f2,f3}/) without the traces, raw rows included; each file over 1 MB
# gzipped; sockets, decoy directories, STOP files and pidfiles left out. (3) Task 109's launchers and records in
# h5/scripts/, and the host lock's task109-arm64 lines.
set -u
VM=cua-171-arm64
D=/Users/new/.local/share/cua-171
T=$D/task109
DST=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m5/arm64/h5
TR=$D/m5/arm64-h5-traces
STAGE=$T/vm-copy
rm -rf "$STAGE"; mkdir -p "$STAGE" "$TR"
X='--exclude decoy/ --exclude *.sock --exclude STOP --exclude *.pid'
for o in out:out-arm64-h5 f2:f2-arm64-h5 f3:f3-arm64-h5; do
  name=${o%%:*}; src=${o#*:}
  ssh "$VM" "test -d $D/m5/$src" || continue
  rsync -a --no-specials --no-devices $X --include '*/' --include 'run/audit-traces/***' --exclude '*' --prune-empty-dirs "$VM:$D/m5/$src/" "$TR/$name/"
  rsync -a --no-specials --no-devices $X --exclude 'run/audit-traces/' "$VM:$D/m5/$src/" "$STAGE/$name/"
done
(cd "$TR" && find . -type f -name '*.gz' | sort | xargs -r sha256sum > "$TR/SHA256SUMS")
rsync -a --no-specials --no-devices --exclude 'vm-copy/' "$VM:$T/" "$STAGE/scripts/"
scp -q "$VM:$D/host-lock.log" "$STAGE/host-lock.log"
scp -q "$VM:$D/hold-sittings-cleared-2026-11-19T11-40Z.txt" "$STAGE/out/" 2>/dev/null
scp -q "$VM:$D/hold-sittings-cleared-2026-11-19T13-55Z.txt" "$STAGE/f3/" 2>/dev/null
mkdir -p "$DST"
for name in out f2 f3 scripts; do
  [ -d "$STAGE/$name" ] || continue
  rm -rf "$DST/$name"; cp -a "$STAGE/$name" "$DST/$name"
done
cp "$T/copy-evidence.sh" "$T/privacy-scan.mjs" "$T/privacy-run.sh" "$T/wait-zero.sh" "$DST/scripts/" 2>/dev/null
grep ' task109-arm64 ' "$STAGE/host-lock.log" > "$DST/scripts/lock-lines.txt"
find "$DST" -type f -size +1M ! -name '*.gz' -print0 | xargs -0 -r gzip -9
find "$DST" -type s -delete 2>/dev/null
find "$DST" -path '*audit-traces*' | head -3
du -sh "$DST"/* "$TR"; echo "trace files: $(grep -c . "$TR/SHA256SUMS")"
