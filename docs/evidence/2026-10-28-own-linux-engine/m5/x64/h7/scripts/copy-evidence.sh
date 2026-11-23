#!/bin/bash
# Task 129 (from task 123's copy-evidence.sh): the H7 step directories copied from the out root into the evidence,
# m5/x64/h7/out/ (C1 and L4c, counted, and print/, the print's stubs), raw rows included; each file over 1 MB gzipped as
# the m4 evidence keeps its traces; sockets, the guard's decoy directories and pidfiles left out. The repository ignores
# *.log, so every .log is kept as .log.txt. Task 129's launchers and records beside them in scripts/, with its lock lines.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task129
DST=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m5/x64/h7
rm -rf "${DST:?}/out"; mkdir -p "$DST/out"
rsync -a --no-specials --no-devices --exclude 'decoy/' --exclude '*.sock' --exclude 'STOP' --exclude '*.pid' "$D/m5/out-x64-h7/" "$DST/out/"
rm -rf "$DST/scripts"; mkdir -p "$DST/scripts"
for f in "$T"/*.sh "$T"/*.mjs "$T"/*.log "$T"/*.txt "$T"/*.md; do [ -e "$f" ] && cp "$f" "$DST/scripts/"; done
grep " task129-x64 " "$D/host-lock.log" > "$DST/scripts/lock-lines.txt"
find "$DST" -type f -name '*.log' -print0 | while IFS= read -r -d '' f; do mv "$f" "$f.txt"; done
find "$DST" -type f -size +1M ! -name '*.gz' -print0 | xargs -0 -r gzip -9
find "$DST" -type s -delete 2>/dev/null
du -sh "$DST"; find "$DST" -type f -size +5M | head
