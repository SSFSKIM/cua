#!/bin/bash
# Task 163 (from task 147's copy-h9.sh): the H10 arm64 steps copied from the VM into the evidence
# (engine-045/reach/arm64/out/: the step dirs with their raw rows, route-audit traces left out, files over 1 MB gzipped,
# logs kept as .log.txt, decoy sockets and pidfiles left out), the launchers and records into scripts/, the lock's
# h10-arm64 lines; step 1's settle rests tallied from the rows; then the scans: token-shaped strings, key codes (no :0
# title list, since nothing connected to :0), and raw U+2028 / U+2029 (`grep -rlP`, over plain and gzipped files).
set -u
VM=dc-linux171arm-996d
D=/Users/new/.local/share/cua-171
T=$D/task163
DST=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/h10-reach-arm64/docs/evidence/2026-10-28-own-linux-engine/engine-045/reach/arm64
X='--exclude decoy/ --exclude *.sock --exclude STOP --exclude *.pid'
rm -rf "$DST"; mkdir -p "$DST"
rsync -a --no-specials --no-devices $X --exclude 'run/audit-traces/' "$VM:$D/m5/out-arm64-h10/" "$DST/out/"
rsync -a --no-specials --no-devices --exclude 'out/' "$VM:$T/" "$DST/scripts/"
cp "$T/copy-h10.sh" "$DST/scripts/"
scp -q "$VM:$D/host-lock.log" "$T/host-lock.log"
grep -a ' h10-arm64 ' "$T/host-lock.log" > "$DST/scripts/lock-lines.txt"
find "$DST" -type f -name '*.log' -exec mv {} {}.txt \;
find "$DST" -type f -size +1M ! -name '*.gz' -print0 | xargs -0 -r gzip -9
find "$DST" -type s -delete 2>/dev/null
for s in H1 H2 L4a; do
  zcat "$DST/out/$s.pinned-release/run/results.jsonl.gz" | node -e '
    const rows = require("fs").readFileSync(0, "utf8").split("\n").filter(Boolean).map(JSON.parse).filter((r) => r.kind === "drop-signal");
    const by = {}, fam = {};
    for (const r of rows) { const s = r.drop_cursor?.settle ?? r.handle?.drop_cursor?.settle; const k = s ? String(s.rest_ms) : "none"; by[k] = (by[k] || 0) + 1; fam[r.family] = (fam[r.family] || 0) + 1; }
    console.log(`${process.argv[1]}: ${rows.length} drop rows ${JSON.stringify(fam)}; rest_ms of the settle records ${JSON.stringify(by)}`);' "$s"
done > "$DST/out/settle-rests.txt"
cat "$DST/out/settle-rests.txt"
bash "$T/scan-evidence.sh" "$DST" > "$T/scan-token.txt"; echo "token scan exit $?"
printf '' | node "$T/privacy-scan.mjs" "$DST" > "$T/privacy-scan.txt"
{
  echo "raw U+2028 / U+2029, plain files (grep -rlP):"; grep -rlP '\x{2028}|\x{2029}' "$DST" | sed "s|$DST/||"
  echo "raw U+2028 / U+2029, gzipped files:"; find "$DST" -name '*.gz' -print0 | xargs -0 -r -n1 sh -c 'zcat "$0" | grep -qP "\x{2028}|\x{2029}" && echo "$0"' | sed "s|$DST/||"
  echo "end"
} > "$T/scan-lsps.txt"
cp "$T/scan-token.txt" "$T/privacy-scan.txt" "$T/scan-lsps.txt" "$DST/scripts/"
cat "$DST/scripts/scan-token.txt"; tail -1 "$DST/scripts/privacy-scan.txt"; cat "$DST/scripts/scan-lsps.txt"
du -sh "$DST"
