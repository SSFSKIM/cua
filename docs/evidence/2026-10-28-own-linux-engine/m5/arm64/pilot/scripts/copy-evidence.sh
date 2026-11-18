#!/bin/bash
# Task 96 (from task 87's copy-evidence.sh): the arm64 pilot's records copied from the VM into the evidence
# (m5/arm64/pilot/): each out root's labelled step directories (out/, the E1 repeats, the twice-load block, the :0
# sitting), the vendor reruns, each file over 1 MB gzipped as the m4 evidence keeps its traces; sockets and the guard's
# decoy directories left out; task 96's launchers and records beside them (scripts/). Run on the x64 host.
set -u
VM=cua-171-arm64
SRC=/Users/new/.local/share/cua-171/m5/pilot-arm64
T=/Users/new/.local/share/cua-171/task96
DST=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m5/arm64/pilot
STAGE=$T/vm-copy
rm -rf "$STAGE"; mkdir -p "$STAGE"
# the VM's out roots and reruns (not the pilot home, its install home or the vendor packages)
rsync -a --no-specials --no-devices --exclude 'decoy/' --exclude '*.sock' --exclude 'STOP' --exclude 'home/' --exclude 'install-home/' \
  "$VM:$SRC/" "$STAGE/pilot-arm64/"
# the V5 and Z0 rerun under the short out root (m5/pa/z1), as out-zero-z1
rsync -a --no-specials --no-devices --exclude 'decoy/' --exclude '*.sock' "$VM:/Users/new/.local/share/cua-171/m5/pa/z1/" "$STAGE/pilot-arm64/out-zero-z1/"
# L4a's rate run (m5/pa/l4) and its idle control, H1 (m5/pa/h1), as l4a-rate/
mkdir -p "$STAGE/pilot-arm64/l4a-rate"
rsync -a --no-specials --no-devices --exclude '*.sock' "$VM:/Users/new/.local/share/cua-171/m5/pa/l4/" "$STAGE/pilot-arm64/l4a-rate/L4a/"
rsync -a --no-specials --no-devices --exclude '*.sock' "$VM:/Users/new/.local/share/cua-171/m5/pa/h1/" "$STAGE/pilot-arm64/l4a-rate/H1/"
# the controller's hold-sittings clearance records
mkdir -p "$STAGE/holds"
rsync -a "$VM:/Users/new/.local/share/cua-171/hold-sittings-cleared-*" "$STAGE/holds/"
# task 96's launchers and records on the VM (not the vendor debs)
rsync -a --exclude 'vendor-index-*' "$VM:$T/" "$STAGE/task96/"
scp -q "$VM:/Users/new/.local/share/cua-171/host-lock.log" "$STAGE/host-lock.log"
rm -rf "$DST"
mkdir -p "$DST/scripts"
for d in "$STAGE"/pilot-arm64/*/; do
  n=$(basename "$d")
  case "$n" in home|install-home) continue ;; esac
  cp -a "$d" "$DST/$n"
done
cp -a "$STAGE"/task96/. "$DST/scripts/"
cp -a "$STAGE/holds" "$DST/holds"
cp "$T"/package-versions.txt "$T"/pkg-versions.sh "$T"/copy-evidence.sh "$T"/scan-evidence.sh "$T"/wait-drive.sh "$T"/wait-ssh.sh "$T"/scenario-rows.sh "$T"/settle-misses.sh "$DST/scripts/" 2>/dev/null
grep 't96-arm64' "$STAGE/host-lock.log" > "$DST/scripts/lock-lines.txt"
cp "$T/README.md" "$DST/README.md"
find "$DST" -type f -size +1M ! -name '*.gz' -print0 | xargs -0 -r gzip -9
find "$DST" -type s -delete 2>/dev/null
du -sh "$DST"; find "$DST" -type f -size +5M | head
