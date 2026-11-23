#!/bin/bash
# Task 58: the person's side read twice, a minute apart, before any step (task 50's owner-check.sh, read only), and
# the two readings compared.
# usage: baseline.sh <dir>
set -u
GUARDS=${CUA171_GUARDS:-$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m4/person-display-live/scripts}
d=$1
mkdir -p "$d"
[ -e "$d/owner-check-1.txt" ] || "$GUARDS/owner-check.sh" baseline-1 > "$d/owner-check-1.txt" 2>&1
sleep 60
"$GUARDS/owner-check.sh" baseline-2 > "$d/owner-check-2.txt" 2>&1
if diff <(grep -v '^==' "$d/owner-check-1.txt") <(grep -v '^==' "$d/owner-check-2.txt") > "$d/diff.txt"; then echo "baseline: the two readings are identical"; else echo "baseline: the readings DIFFER"; cat "$d/diff.txt"; fi
