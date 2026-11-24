#!/bin/bash
# Task 162 (task 148's copy-evidence.sh, without item 3): x64's reach at H10 copied into the evidence of the t162-x64 worktree,
# engine-045/reach/x64/: out/ (the counted steps H1, H2, L4a, L4d, the driver's log, print/ with the print's stubs, raw
# rows included) and scripts/ (task
# 162's launchers, records and extracts, with its lock lines). Each file over 1 MB gzipped; sockets, decoy directories
# and pidfiles left out. The repository ignores *.log, so every .log is kept as .log.txt.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task162
DST=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/t162-x64/docs/evidence/2026-10-28-own-linux-engine/engine-045/reach/x64
mkdir -p "$DST"
rm -rf "${DST:?}/out" "${DST:?}/scripts"; mkdir -p "$DST/out" "$DST/scripts"
rsync -a --no-specials --no-devices --exclude 'decoy/' --exclude '*.sock' --exclude 'STOP' --exclude '*.pid' "$D/m5/out-x64-h10/" "$DST/out/"
for f in "$T"/*.sh "$T"/*.mjs "$T"/*.py "$T"/*.log "$T"/*.txt "$T"/*.md "$T"/*.diff; do [ -e "$f" ] && cp "$f" "$DST/scripts/"; done
grep " h10-x64 " "$D/host-lock.log" > "$DST/scripts/lock-lines.txt"
find "$DST" -type f -name '*.log' -print0 | while IFS= read -r -d '' f; do mv "$f" "$f.txt"; done
find "$DST" -type f -size +1M ! -name '*.gz' -print0 | xargs -0 -r gzip -9
find "$DST" -type s -delete 2>/dev/null
du -sh "$DST"; find "$DST" -type f -size +5M | head
