#!/bin/bash
# Task 148 (task 135's scans.sh): the scans over engine-044/reach/x64/ before the commit: token-shaped strings (file
# names only), key codes (privacy-scan.mjs, given no titles: x64's :0 is the owner's display and is never read), and
# the structural title scan (ruling 947) over out/ and handle/, their output into scripts/.
set -u
T=/Users/new/.local/share/cua-171/task148
H=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/t148-x64/docs/evidence/2026-10-28-own-linux-engine/engine-044/reach/x64
{
  "$T/scan-evidence.sh" "$H" | tail -2
  echo "token scan exit ${PIPESTATUS[0]}"
  echo -n | node "$T/privacy-scan.mjs" "$H" | tail -3
  echo "key-code scan exit ${PIPESTATUS[1]}"
} > "$T/scans.txt" 2>&1
node "$T/title-scan.mjs" "$H/out" "$H/handle" > "$T/title-scan.txt" 2>&1
echo "title scan exit $?" >> "$T/title-scan.txt"
cat "$T/scans.txt" "$T/title-scan.txt"
cp "$T/scans.txt" "$T/title-scan.txt" "$H/scripts/"
