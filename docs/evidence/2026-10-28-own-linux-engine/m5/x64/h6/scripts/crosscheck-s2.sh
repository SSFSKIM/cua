#!/bin/bash
# Task 123: S2's cross-check (ruling 929), its H6 summary against its record at H (fefe306c, x64 T5; S2 stood on H at
# H⁗), cell by cell, by M4's compare-settle.mjs (read-only) from the t123-x64 checkout. Output crosscheck-S2.txt.
set -u
T=/Users/new/.local/share/cua-171/task123
node /Users/new/Developer/GitHub/cua/.claude/worktrees/t123-x64/docs/evidence/2026-10-28-own-linux-engine/m4/gate/scripts/compare-settle.mjs \
  /Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m5/x64/out/S2.pinned-release/run/summary.md \
  /Users/new/.local/share/cua-171/m5/out-x64-h6/S2.pinned-release/run/summary.md > "$T/crosscheck-S2.txt"
c=$?
echo "compare-settle exit $c" >> "$T/crosscheck-S2.txt"
cat "$T/crosscheck-S2.txt"
