#!/bin/bash
# Task 122 (from task 109's copy-evidence.sh), run on the x64 host. (1) V5's kept route-audit traces (run/audit-traces/,
# rulings 858(b), 863) copied from the VM into ~/.local/share/cua-171/m5/arm64-h6-traces/out/<step dir>/, never
# committed, with a sha256 list. (2) The step directories of the H6 out root copied into the evidence (m5/arm64/h6/out/)
# without the traces, raw rows included; each file over 1 MB gzipped; sockets, decoy directories, STOP files and
# pidfiles left out. (3) Task 122's launchers and records in h6/scripts/, and the host lock's task122-arm64 lines.
set -u
VM=cua-171-arm64
D=/Users/new/.local/share/cua-171
T=$D/task122
DST=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m5/arm64/h6
TR=$D/m5/arm64-h6-traces
STAGE=$T/vm-copy
rm -rf "$STAGE"; mkdir -p "$STAGE" "$TR"
X='--exclude decoy/ --exclude *.sock --exclude STOP --exclude *.pid'
rsync -a --no-specials --no-devices $X --include '*/' --include 'run/audit-traces/***' --exclude '*' --prune-empty-dirs "$VM:$D/m5/out-arm64-h6/" "$TR/out/"
rsync -a --no-specials --no-devices $X --exclude 'run/audit-traces/' "$VM:$D/m5/out-arm64-h6/" "$STAGE/out/"
# ruling 953's development runs (and, when run, ruling 954.2's sweep on m5-h7), beside the counted steps
rsync -a --no-specials --no-devices $X "$VM:$D/m5/a953-arm64-h6/" "$STAGE/a953/"
rsync -a --no-specials --no-devices $X "$VM:$D/m5/a957-arm64-h6/" "$STAGE/a957/"
# ruling 959: the device cell at H6 (cua only) and on the development branch m5-a959 (the vendor lanes too)
rsync -a --no-specials --no-devices $X --exclude 'run/audit-traces/' "$VM:$D/m5/a959-arm64-h6/" "$STAGE/a959/h6-cua/"
rsync -a --no-specials --no-devices $X --exclude 'run/audit-traces/' "$VM:$D/m5/a959-arm64-m5a959/" "$STAGE/a959/m5-a959/"
ssh "$VM" "test -d $D/m5/s954-arm64-h7" && rsync -a --no-specials --no-devices $X "$VM:$D/m5/s954-arm64-h7/" "$STAGE/s954/"
(cd "$TR" && find . -type f ! -name SHA256SUMS | sort | xargs -r sha256sum > "$TR/SHA256SUMS")
rsync -a --no-specials --no-devices --exclude 'vm-copy/' --exclude 'item9/desktop/' "$VM:$T/" "$STAGE/scripts/"
scp -q "$VM:$D/host-lock.log" "$STAGE/host-lock.log"
mkdir -p "$DST"
for name in out a953 a957 a959 s954 scripts; do
  [ -d "$STAGE/$name" ] || continue
  rm -rf "$DST/$name"; cp -a "$STAGE/$name" "$DST/$name"
done
for f in copy-evidence.sh privacy-scan.mjs privacy-run.sh scan-evidence.sh; do cp "$T/$f" "$DST/scripts/"; done
cp "$TR/SHA256SUMS" "$DST/scripts/kept-traces.sha256"
cp "$T/a957-verify/attestation-041.txt" "$DST/a957/"
grep ' task122-arm64 ' "$STAGE/host-lock.log" > "$DST/scripts/lock-lines.txt"
# the repository ignores *.log (task 121's discovery): logs are kept as .log.txt
find "$DST" -type f -name '*.log' -exec mv {} {}.txt \;
find "$DST" -type f -size +1M ! -name '*.gz' -print0 | xargs -0 -r gzip -9
find "$DST" -type s -delete 2>/dev/null
find "$DST" -path '*audit-traces*' | head -3
du -sh "$DST"/* "$TR"; echo "trace files: $(grep -c . "$TR/SHA256SUMS")"
