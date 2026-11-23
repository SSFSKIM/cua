#!/bin/bash
# Task 87: every pilot step that exited 1, its failure reasons classified (failed-reasons.mjs).
set -u
O=/Users/new/.local/share/cua-171/m5/pilot-x64/out
for s in S1 S2 S3 S4 F1a F1b L3a L3b L3c L3d L3e F3a F3b; do
  echo "$s: $(node /Users/new/.local/share/cua-171/task87/x64/failed-reasons.mjs "$O/$s.development-run.pilot" | head -5)"
done
