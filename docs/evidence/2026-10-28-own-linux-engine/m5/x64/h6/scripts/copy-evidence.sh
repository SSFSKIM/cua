#!/bin/bash
# Task 123 (from task 105's copy-evidence.sh): the H6 step directories copied from the out roots into the evidence,
# m5/x64/h6/ (out/: the counted private steps; zero/: V5's :0 sitting), raw rows included; each file over 1 MB gzipped
# as the m4 evidence keeps its traces; sockets, the guard's decoy directories and pidfiles left out. The repository
# ignores *.log, so every .log is kept as .log.txt (task 121's discovery). Task 123's launchers and records beside them
# in scripts/.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task123
DST=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m5/x64/h6
# EXCLUDE names steps still running (their directories are left out until they end), e.g. EXCLUDE="L3a"
ex=(); for s in ${EXCLUDE:-}; do ex+=(--exclude "$s.pinned-release/" --exclude "$s.driver.out"); done
copy() {  # <src out root> <dst subdir>
  [ -d "$1" ] || return 0
  rm -rf "${DST:?}/$2"; mkdir -p "$DST/$2"
  rsync -a --no-specials --no-devices --exclude 'decoy/' --exclude '*.sock' --exclude 'STOP' --exclude '*.pid' ${ex[@]+"${ex[@]}"} "$1/" "$DST/$2/"
}
copy "$D/m5/out-x64-h6" out
copy "$D/m5/zero-x64-h6" zero
rm -rf "$DST/scripts"; mkdir -p "$DST/scripts/proof"
for f in "$T"/*.sh "$T"/*.mjs "$T"/*.log "$T"/*.txt "$T"/*.md "$T"/*.out "$T"/*.jsonl; do [ -e "$f" ] && cp "$f" "$DST/scripts/"; done
cp "$T"/proof/* "$DST/scripts/proof/" 2>/dev/null
[ -d "$T/item9" ] && cp -r "$T/item9" "$DST/scripts/item9"
grep " task123-x64 " "$D/host-lock.log" > "$DST/scripts/lock-lines.txt"
find "$DST" -type f -name '*.log' -print0 | while IFS= read -r -d '' f; do mv "$f" "$f.txt"; done
find "$DST" -type f -size +1M ! -name '*.gz' -print0 | xargs -0 -r gzip -9
find "$DST" -type s -delete 2>/dev/null
du -sh "$DST"; find "$DST" -type f -size +5M | head
