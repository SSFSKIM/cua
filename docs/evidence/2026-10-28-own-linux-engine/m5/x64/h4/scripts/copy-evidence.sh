#!/bin/bash
# Task 105 (from task 89's copy-evidence.sh): the H'''' step directories copied from the out roots into the evidence,
# m5/x64/h4/ (out/: the counted private steps; pilot/: the counter pilot; zero/: the :0 sitting, when it has run), raw
# rows included; each file over 1 MB gzipped as the m4 evidence keeps its traces; sockets, the guard's decoy
# directories and pidfiles left out. Task 105's launchers and records beside them in scripts/.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task105
DST=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m5/x64/h4
copy() {  # <src out root> <dst subdir>
  [ -d "$1" ] || return 0
  rm -rf "${DST:?}/$2"; mkdir -p "$DST/$2"
  rsync -a --no-specials --no-devices --exclude 'decoy/' --exclude '*.sock' --exclude 'STOP' --exclude '*.pid' "$1/" "$DST/$2/"
}
copy "$D/m5/out-x64-h4" out
copy "$D/m5/pilot-x64-h4" pilot
copy "$D/m5/zero-x64-h4" zero
rm -rf "$DST/scripts"; mkdir -p "$DST/scripts/proof"
for f in "$T"/*.sh "$T"/*.mjs "$T"/*.log "$T"/*.txt "$T"/*.md "$T"/*.out; do [ -e "$f" ] && cp "$f" "$DST/scripts/"; done
cp "$T"/proof/*.log "$T"/proof/*.txt "$DST/scripts/proof/" 2>/dev/null
grep " t105-x64 " "$D/host-lock.log" > "$DST/scripts/lock-lines.txt"
find "$DST" -type f -size +1M ! -name '*.gz' -print0 | xargs -0 -r gzip -9
find "$DST" -type s -delete 2>/dev/null
du -sh "$DST"; find "$DST" -type f -size +5M | head
