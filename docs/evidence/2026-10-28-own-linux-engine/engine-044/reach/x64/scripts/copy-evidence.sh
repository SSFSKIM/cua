#!/bin/bash
# Task 148 (task 135's copy-evidence.sh): x64's reach at H9 copied into the evidence of the t148-x64 worktree,
# engine-044/reach/x64/: out/ (the counted steps H1, H2, L4a, L4d, the driver's log, print/ with the print's stubs, raw
# rows included), handle/ (item 3's development set, its rows and engine stats, and its tables), and scripts/ (task
# 148's launchers, records and extracts, with its lock lines). Each file over 1 MB gzipped; sockets, decoy directories
# and pidfiles left out. The repository ignores *.log, so every .log is kept as .log.txt.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task148
DST=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/t148-x64/docs/evidence/2026-10-28-own-linux-engine/engine-044/reach/x64
mkdir -p "$DST"
rm -rf "${DST:?}/out" "${DST:?}/handle" "${DST:?}/scripts"; mkdir -p "$DST/out" "$DST/handle" "$DST/scripts"
rsync -a --no-specials --no-devices --exclude 'decoy/' --exclude '*.sock' --exclude 'STOP' --exclude '*.pid' "$D/m5/out-x64-h9/" "$DST/out/"
rsync -a --no-specials --no-devices --exclude 'decoy/' --exclude '*.sock' --exclude '*.pid' "$T/out/handle-x64/" "$DST/handle/"
cp "$T/out/handle.log" "$DST/handle/"
for f in "$T"/*.sh "$T"/*.mjs "$T"/*.py "$T"/*.log "$T"/*.txt "$T"/*.md "$T"/*.diff; do [ -e "$f" ] && cp "$f" "$DST/scripts/"; done
mkdir -p "$DST/scripts/handle-scripts" "$DST/scripts/bin"
cp "$T"/scripts/* "$DST/scripts/handle-scripts/"
cp "$T/bin/off-044" "$DST/scripts/bin/"
grep " h9-x64 " "$D/host-lock.log" > "$DST/scripts/lock-lines.txt"
find "$DST" -type f -name '*.log' -print0 | while IFS= read -r -d '' f; do mv "$f" "$f.txt"; done
find "$DST" -type f -size +1M ! -name '*.gz' -print0 | xargs -0 -r gzip -9
find "$DST" -type s -delete 2>/dev/null
du -sh "$DST"; find "$DST" -type f -size +5M | head
