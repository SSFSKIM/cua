#!/bin/bash
# Task 160: the x300 set copied from the VM into the evidence (engine-045/x300-arm64/): the set whole (every run's rows,
# the engine's --stats lines, summaries, the alternation's record, the analyses), files over 1 MB gzipped, logs kept as
# .log.txt; the launchers and setup logs into scripts/, and the lock's t160 lines; then the scans.
set -u
VM=dc-linux171arm-996d
D=/Users/new/.local/share/cua-171
T=$D/task160
DST=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/engine-045-x300/docs/evidence/2026-10-28-own-linux-engine/engine-045/x300-arm64
X='--exclude decoy/ --exclude *.sock --exclude STOP --exclude *.pid'
rm -rf "$DST"; mkdir -p "$DST/scripts"
rsync -a --no-specials --no-devices $X --exclude 'run/audit-traces/' "$VM:$T/out/x300/" "$DST/x300/"
scp -q "$VM:$T/out/run.log" "$VM:$T/run.out" "$VM:$T/setup-all.log" "$VM:$T/setup-e045.log" "$DST/scripts/"
for f in setup-all.sh setup.sh add-left-plan.py run.sh t132-run.mjs t132-alternate.mjs t132-tables.mjs t147-left-table.mjs t160-table.mjs t160-moved.mjs; do scp -q "$VM:$T/$f" "$DST/scripts/"; done
cp "$T/copy.sh" "$T/scan-evidence.sh" "$T/privacy-scan.mjs" "$DST/scripts/"
scp -q "$VM:$D/host-lock.log" "$T/host-lock.log"
grep -a ' t160 ' "$T/host-lock.log" > "$DST/scripts/lock-lines.txt"
find "$DST" -type f -name '*.log' -exec mv {} {}.txt \;
find "$DST" -type f -size +1M ! -name '*.gz' -print0 | xargs -0 -r gzip -9
find "$DST" -type s -delete 2>/dev/null
bash "$T/scan-evidence.sh" "$DST" > "$T/scan-token.txt"; echo "token scan exit $?"
printf '' | node "$T/privacy-scan.mjs" "$DST" > "$T/privacy-scan.txt"
cp "$T/scan-token.txt" "$T/privacy-scan.txt" "$DST/scripts/"
cat "$DST/scripts/scan-token.txt"; tail -1 "$DST/scripts/privacy-scan.txt"; cat "$DST/scripts/lock-lines.txt" | cut -c1-80
du -sh "$DST"
