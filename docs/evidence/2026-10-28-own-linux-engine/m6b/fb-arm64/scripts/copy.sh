#!/bin/bash
# Task 165 (from task 163's copy-h10.sh): FB's out directory and the launchers copied from the VM into the evidence
# (m6b/fb-arm64-main/), logs kept as .log.txt, files over 1 MB gzipped; the lock's t165-arm64 lines; then the scans:
# token-shaped strings, key codes (no :0 title list, since nothing connected to :0), raw U+2028 / U+2029 over plain and
# gzipped files.
set -u
VM=dc-linux171arm-996d
D=/Users/new/.local/share/cua-171
T=$D/task165
DST=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/m6b-fb-arm64/docs/evidence/2026-10-28-own-linux-engine/m6b/fb-arm64-main
rm -rf "$DST"; mkdir -p "$DST"
rsync -a --no-specials --no-devices --exclude decoy/ --exclude '*.sock' --exclude '*.pid' "$VM:$D/m6b/out-arm64-fb/" "$DST/out/"
rsync -a --no-specials --no-devices "$VM:$T/" "$DST/scripts/"
cp "$T/copy.sh" "$DST/scripts/"
scp -q "$VM:$D/host-lock.log" "$T/host-lock.log"
grep -a ' t165-arm64 ' "$T/host-lock.log" > "$DST/scripts/lock-lines.txt"
find "$DST" -type f -name '*.log' -exec mv {} {}.txt \;
find "$DST" -type f -size +1M ! -name '*.gz' -print0 | xargs -0 -r gzip -9
find "$DST" -type s -delete 2>/dev/null
bash "$T/scan-evidence.sh" "$DST" > "$T/scan-token.txt"; echo "token scan exit $?"
printf '' | node "$T/privacy-scan.mjs" "$DST" > "$T/privacy-scan.txt"
{
  echo "raw U+2028 / U+2029, plain files (grep -rlP):"; grep -rlP '\x{2028}|\x{2029}' "$DST" | sed "s|$DST/||"
  echo "raw U+2028 / U+2029, gzipped files:"; find "$DST" -name '*.gz' -print0 | xargs -0 -r -n1 sh -c 'zcat "$0" | grep -qP "\x{2028}|\x{2029}" && echo "$0"' | sed "s|$DST/||"
  echo "end"
} > "$T/scan-lsps.txt"
cp "$T/scan-token.txt" "$T/privacy-scan.txt" "$T/scan-lsps.txt" "$DST/scripts/"
cat "$DST/scripts/scan-token.txt"; tail -1 "$DST/scripts/privacy-scan.txt"; cat "$DST/scripts/scan-lsps.txt"; cat "$DST/scripts/lock-lines.txt" | cut -c1-90
du -sh "$DST"
