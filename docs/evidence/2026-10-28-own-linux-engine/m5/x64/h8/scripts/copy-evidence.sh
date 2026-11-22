#!/bin/bash
# Task 135 (task 129's copy-evidence.sh): the H8 step directories copied from the out root into the evidence of the
# m5-h8-x64 worktree, m5/x64/h8/out/ (the counted steps, the driver's log, print/ with the print's stubs), raw rows
# included; each file over 1 MB gzipped as the earlier sets keep them; sockets, decoy directories and pidfiles left out.
# The repository ignores *.log, so every .log is kept as .log.txt. Task 135's launchers, records and extracts beside
# them in scripts/ (item 9's and the pinned home's doctor transcripts in scripts/item9/ and scripts/doctor-home/), with
# its lock lines.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task135
DST=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/m5-h8-x64/docs/evidence/2026-10-28-own-linux-engine/m5/x64/h8
[ -d "$(dirname "$DST")" ] || { echo "no m5-h8-x64 worktree"; exit 2; }
rm -rf "${DST:?}/out"; mkdir -p "$DST/out"
rsync -a --no-specials --no-devices --exclude 'decoy/' --exclude '*.sock' --exclude 'STOP' --exclude '*.pid' "$D/m5/out-x64-h8/" "$DST/out/"
rm -rf "$DST/scripts"; mkdir -p "$DST/scripts"
for f in "$T"/*.sh "$T"/*.mjs "$T"/*.log "$T"/*.txt "$T"/*.md; do [ -e "$f" ] && cp "$f" "$DST/scripts/"; done
for d in item9 doctor-home; do [ -f "$T/$d/inner.out" ] && { mkdir -p "$DST/scripts/$d"; cp "$T/$d/inner.out" "$DST/scripts/$d/"; [ -f "$T/$d/desktop/watchdog.jsonl" ] && cp "$T/$d/desktop/watchdog.jsonl" "$DST/scripts/$d/"; }; done
grep " h8-x64 " "$D/host-lock.log" > "$DST/scripts/lock-lines.txt"
find "$DST" -type f -name '*.log' -print0 | while IFS= read -r -d '' f; do mv "$f" "$f.txt"; done
find "$DST" -type f -size +1M ! -name '*.gz' -print0 | xargs -0 -r gzip -9
find "$DST" -type s -delete 2>/dev/null
du -sh "$DST"; find "$DST" -type f -size +5M | head
