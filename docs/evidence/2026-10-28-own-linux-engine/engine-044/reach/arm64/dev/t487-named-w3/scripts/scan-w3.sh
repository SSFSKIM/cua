#!/bin/bash
# Task 147, ruling 1143 (c): the wave 3 evidence scanned before its commit (token-shaped strings; key codes, with no :0
# title list since nothing connected to :0), the results saved beside it.
set -u
T=/Users/new/.local/share/cua-171/task147
E=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/h9-487-arm64/docs/evidence/2026-10-28-own-linux-engine/engine-044/reach/arm64/dev/t487-named-w3
cp "$T/scan-w3.sh" "$T/scan-evidence.sh" "$T/privacy-scan.mjs" "$E/scripts/"
bash "$T/scan-evidence.sh" "$E" > "$T/scan-token-w3.txt"; echo "token scan exit $?"
printf '' | node "$T/privacy-scan.mjs" "$E" > "$T/privacy-scan-w3.txt"
cp "$T/scan-token-w3.txt" "$E/scripts/scan-token.txt"; cp "$T/privacy-scan-w3.txt" "$E/scripts/privacy-scan.txt"
cat "$E/scripts/scan-token.txt"; tail -1 "$E/scripts/privacy-scan.txt"
