#!/bin/bash
# Task 162 (task 135's scans.sh): the scans over engine-045/reach/x64/ before the commit: token-shaped strings (file
# names only), key codes (privacy-scan.mjs, given no titles: x64's :0 is the owner's display and is never read), and
# the structural title scan (ruling 947) over out/, their output into scripts/; and raw U+2028 / U+2029 (task 162).
set -u
T=/Users/new/.local/share/cua-171/task162
H=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/t162-x64/docs/evidence/2026-10-28-own-linux-engine/engine-045/reach/x64
{
  "$T/scan-evidence.sh" "$H" | tail -2
  echo "token scan exit ${PIPESTATUS[0]}"
  echo -n | node "$T/privacy-scan.mjs" "$H" | tail -3
  echo "key-code scan exit ${PIPESTATUS[1]}"
} > "$T/scans.txt" 2>&1
node "$T/title-scan.mjs" "$H/out" > "$T/title-scan.txt" 2>&1
echo "title scan exit $?" >> "$T/title-scan.txt"
cat "$T/scans.txt" "$T/title-scan.txt"
cp "$T/scans.txt" "$T/title-scan.txt" "$H/scripts/"
# raw U+2028 / U+2029 where escape text is meant (the brief): file names only
{
  echo "raw U+2028 / U+2029, plain: $(grep -rlP '\x{2028}|\x{2029}' "$H" | wc -l) file(s)"
  grep -rlP '\x{2028}|\x{2029}' "$H"
  echo "raw U+2028 / U+2029, text files only (grep -I): $(grep -rlIP '\x{2028}|\x{2029}' "$H" | wc -l) file(s)"
  echo "raw U+2028 / U+2029, gz: $(find "$H" -name '*.gz' -print0 | xargs -0 -r zgrep -lP '\x{2028}|\x{2029}' | wc -l) file(s)"
} > "$T/ls-ps-scan.txt" 2>&1
cat "$T/ls-ps-scan.txt"
cp "$T/ls-ps-scan.txt" "$H/scripts/"
