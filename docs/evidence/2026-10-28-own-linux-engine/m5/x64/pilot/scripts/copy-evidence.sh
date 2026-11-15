#!/bin/bash
# Task 87 (from task 79's copy-evidence.sh): the x64 pilot's labelled step directories copied into the evidence
# (m5/x64/pilot/), each file over 1 MB gzipped as the m4 evidence keeps its traces; sockets and the guard's decoy
# directories left out; task 87's launchers and records beside them.
set -u
SRC=/Users/new/.local/share/cua-171/m5/pilot-x64/out
T=/Users/new/.local/share/cua-171/task87/x64
DST=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m5/x64/pilot
# a fresh copy each time: a second rsync would put the uncompressed files back beside their .gz
rm -rf "$DST/out"
mkdir -p "$DST/out" "$DST/scripts"
rsync -a --no-specials --no-devices --exclude 'decoy/' --exclude '*.sock' --exclude 'STOP' "$SRC/" "$DST/out/"
for f in setup-pilot.sh setup-pilot.log install-home.sh install-home.log check-pinned.log g.sh drive.sh print-zero.sh run-zero.sh zero-commands.txt list.txt pilot-table.mjs scan-evidence.sh copy-evidence.sh lock-lines.txt pinned-path.sh precheck-zero.sh hard-stop.sh zero-V3.precheck.out leftover-scratch.sh leftover-scratch.txt leftover-scratch-remove.txt leftover-processes.txt procs-of-scratch.sh pattern-check.sh pilot-table.md refresh-records.sh failed-reasons.mjs reasons-all.sh reasons-all.txt wait-event.sh; do
  [ -e "$T/$f" ] && cp "$T/$f" "$DST/scripts/$f"
done
for f in "$T"/zero-*.out; do [ -e "$f" ] && cp "$f" "$DST/scripts/"; done
find "$DST" -type f -size +1M ! -name '*.gz' -print0 | xargs -0 -r gzip -9
find "$DST" -type s -delete 2>/dev/null
du -sh "$DST"; find "$DST" -type f -size +5M | head
