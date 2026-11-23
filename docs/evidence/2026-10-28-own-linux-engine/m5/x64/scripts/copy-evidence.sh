#!/bin/bash
# Task 89 (from task 87's copy-evidence.sh): T5's labelled step directories copied from the out roots into the evidence
# (m5/x64/out/, and m5/x64/f3-out/ for F3's lane when it has run), raw rows included (every vendor series, items 12 and
# 13); each file over 1 MB gzipped as the m4 evidence keeps its traces; sockets, the guard's decoy directories and
# pidfiles left out. Task 89's launchers and records beside them in scripts/ (no secret is read or held by any).
set -u
D=/Users/new/.local/share/cua-171
T=$D/task89
DST=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m5/x64
copy() {  # <src out root> <dst subdir>
  [ -d "$1" ] || return 0
  rm -rf "$DST/$2"; mkdir -p "$DST/$2"
  rsync -a --no-specials --no-devices --exclude 'decoy/' --exclude '*.sock' --exclude 'STOP' --exclude '*.pid' "$1/" "$DST/$2/"
}
copy "$D/m5/out-x64" out
copy "$D/m5/out-x64-rerun1" out-rerun1
copy "$D/m5/f3-out-x64" f3-out
# V5's re-judge at H' (ruling 756, task 90's rejudge-device.mjs over the stored rows), beside the rerun
mkdir -p "$DST/out-rerun1/V5-rejudge-756"
cp "$D"/task90/rejudge-fix1.out "$D"/task90/V5-rerun1.rejudge-device.jsonl "$D"/task90/V5-first.rejudge-device.jsonl "$D"/task90/probe-ran.mjs "$D"/task90/probe-ran.out "$DST/out-rerun1/V5-rejudge-756/"
# the first V5's stop (rulings 749, 750): the proof read from its records, and the controller's clearance record
mkdir -p "$DST/V5-stopped"
cp "$T/v5-flag-proof.py" "$T/v5-flag-proof.txt" "$DST/V5-stopped/"
cp "$D"/hold-sittings-cleared/2026-11-17T02:30:44Z.txt "$DST/V5-stopped/hold-sittings-cleared-2026-11-17T02:30:44Z.txt"
rm -rf "$DST/scripts"; mkdir -p "$DST/scripts/proof" "$DST/scripts/item9"
for f in "$T"/*.sh "$T"/*.mjs "$T"/*.log "$T"/*.txt "$T"/*.md "$T"/*.out; do [ -e "$f" ] && cp "$f" "$DST/scripts/"; done
cp "$T"/proof/*.log "$T"/proof/*.txt "$DST/scripts/proof/" 2>/dev/null
cp -r "$T/rejudge-680" "$DST/scripts/"
cp "$T"/*.py "$DST/scripts/"
# item 9's transcript with the fresh home's mktemp path as <fresh>, and its private desktop's session record
sed -E 's#/tmp/tmp\.[A-Za-z0-9]+#<fresh>#g' "$T/item9/inner.out" > "$DST/scripts/item9/transcript.txt"
cp "$T/item9/desktop/session.json" "$DST/scripts/item9/" 2>/dev/null
cp "$D/vendor/deb-26.1111/verification.txt" "$DST/scripts/vendor-26.1111-verification.txt"
cp "$D/vendor/deb-26.1111/index/InRelease" "$DST/scripts/vendor-26.1111-InRelease"
cp "$D/vendor/deb-26.1111/index/Packages" "$DST/scripts/vendor-26.1111-Packages-amd64"
grep " t5-x64 " "$D/host-lock.log" > "$DST/scripts/lock-lines.txt"
find "$DST" -type f -size +1M ! -name '*.gz' -print0 | xargs -0 -r gzip -9
find "$DST" -type s -delete 2>/dev/null
du -sh "$DST"; find "$DST" -type f -size +5M | head
