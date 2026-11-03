#!/bin/bash
# Task 50: copies the person's-display steps (0-3, the baseline) into m4/person-display-live/ and T4c's full manifest
# (the run and the stopped first attempt) into m4/harness-windows/t4c-full/, large files gzipped by task 49's
# evidence.py (the decoy sockets, pid files and markers left out), with this session's scripts.
set -u
M4=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m4
E=$M4/person-display-live
F=$M4/harness-windows/t4c-full
R=/Users/new/.local/share/cua-171/task50/runs
S=/Users/new/.local/share/cua-171/task50/scripts
rm -rf "$E/runs" "$E/scripts" "$F/runs"
mkdir -p "$E/runs" "$E/scripts" "$F/runs"
for s in step0-test step0-xtools baseline qt-bridge run-bus-stopped run-bus; do
  python3 -I /Users/new/.local/share/cua-171/task49/scripts/evidence.py "$R/$s" "$E/runs/$s" > /dev/null
done
for s in qt-bridge run-bus-stopped run-bus; do cp "$R/$s.out" "$E/runs/$s/runner.out"; done
for s in t4c-full t4c-full-stopped; do
  python3 -I /Users/new/.local/share/cua-171/task49/scripts/evidence.py "$R/$s" "$F/runs/$s" > /dev/null
  cp "$R/$s.out" "$F/runs/$s/runner.out"
done
rm -f "$E"/runs/*/start.marker "$F"/runs/*/start.marker
cp "$S"/*.py "$S"/*.sh "$S"/*.mjs "$E/scripts/"
du -sh "$E" "$F"
find "$E" "$F" -type f | wc -l
