#!/bin/bash
# x64 V5 at H8: the sitting's evidence into the m5-h8-x64-v5 worktree, m5/x64/h8/zero/ (V5's step directory as the
# runner wrote it, raw rows included, and zero.log) and m5/x64/h8/zero-scripts/ (the launchers, the plan, the precheck
# records, the sitting's output, the reads after it, the classifier and narrowing checks with their count-only outputs,
# the sidecar's sha256, and the sitting's lock lines). Left out: the guard's decoy sockets and pidfiles; the capture
# sidecar's capture (ruling 1054: raw, on this host only, never committed; this run captured nothing); the sidecar's and
# its test's sources and the test's records (outside the tree; their sha256 is kept); task 136's originals. Each file
# over 1 MB gzipped; every .log kept as .log.txt, since the repository ignores *.log.
set -u
D=/Users/new/.local/share/cua-171
T=$D/v5h8
DST=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/m5-h8-x64-v5/docs/evidence/2026-10-28-own-linux-engine/m5/x64/h8
[ -d "$(dirname "$DST")" ] || { echo "no m5-h8-x64-v5 worktree"; exit 2; }
rm -rf "${DST:?}/zero" "${DST:?}/zero-scripts"; mkdir -p "$DST/zero" "$DST/zero-scripts"
rsync -a --no-specials --no-devices --exclude 'decoy/' --exclude '*.sock' --exclude '*.pid' "$D/m5/zero-x64-h8/" "$DST/zero/"
for f in go-v5.sh run-sitting.sh sitting-locked.sh sitting.sh precheck-zero.sh precheck-now.sh precheck-now.out print-zero.sh \
  zero-commands.txt compare-v5-line.py compare-v5-line.txt after-step.sh after-V5.txt after-V5.txt.rejudge.jsonl v5-status.sh \
  v5-status.txt v5-rows.py v5-rows.txt classify-stop.py classify-stop-arm-stopped-2.txt classify-stop-arm-stopped-2-narrowed.txt \
  classify-stop-x64-test.txt narrow-check.py narrow-check-test.txt narrow-check-arm-stopped-2.txt narrow-filter.py \
  narrow-filter-arm-stopped-2.txt sidecar-sha256.txt go-v5.log run-sitting.log zero-precheck.out zero-V5.out copy-evidence.sh; do
  [ -e "$T/$f" ] && cp "$T/$f" "$DST/zero-scripts/"
done
cp "$D/drafts/v5-plan-h8.txt" "$DST/zero-scripts/v5-plan-h8.txt"
grep " h8-x64 " "$D/host-lock.log" | grep -E 'v5h8/sitting.sh|2026-11-23' > "$DST/zero-scripts/lock-lines.txt"
find "$DST/zero" "$DST/zero-scripts" -type f -name '*.log' -print0 | while IFS= read -r -d '' f; do mv "$f" "$f.txt"; done
find "$DST/zero" "$DST/zero-scripts" -type f -size +1M ! -name '*.gz' -print0 | xargs -0 -r gzip -9
find "$DST/zero" -type s -delete 2>/dev/null
du -sh "$DST/zero" "$DST/zero-scripts"; find "$DST/zero" "$DST/zero-scripts" -type f -size +5M | head
