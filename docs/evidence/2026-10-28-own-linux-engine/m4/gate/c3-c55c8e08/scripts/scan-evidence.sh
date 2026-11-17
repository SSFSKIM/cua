#!/bin/bash
# Task 79 (task76/scan-evidence.sh, with the stored secret values): an evidence directory scanned before it is
# committed, for token-shaped strings and for the values in ~/.config/claude-secrets. It prints names of files and
# counts only, never a value or a matching line.
# usage: scan-evidence.sh <dir>
set -u
DST=$1
cd "$DST" || exit 2
PAT='ghp_[A-Za-z0-9]{20}|gho_[A-Za-z0-9]{20}|ghs_[A-Za-z0-9]{20}|github_pat_|PLAYWRIGHT_MCP_EXTENSION_TOKEN=[^ "]|BEGIN (RSA|EC|OPENSSH)? ?PRIVATE KEY|sk-[A-Za-z0-9_-]{20}|xox[abp]-[A-Za-z0-9-]{10}|AKIA[0-9A-Z]{16}'
hits=0
echo "token-shaped, plain:"; r=$(grep -rIlE "$PAT" . | head); [ -n "$r" ] && { echo "$r"; hits=1; }
echo "token-shaped, gz:"; r=$(find . -name '*.gz' -print0 | xargs -0 -r zgrep -lE "$PAT" | head); [ -n "$r" ] && { echo "$r"; hits=1; }
n=0
for f in "$HOME"/.config/claude-secrets/*; do
  [ -f "$f" ] || continue
  n=$((n + 1))
  # the value as one fixed pattern, blank lines dropped (a blank pattern would match everything)
  r=$(grep -rlF -f <(grep -v '^$' "$f") . | head)
  r2=$(find . -name '*.gz' -print0 | xargs -0 -r zgrep -lF -f <(grep -v '^$' "$f") | head)
  if [ -n "$r$r2" ]; then echo "stored value $(basename "$f") found in:"; echo "$r$r2"; hits=1; fi
done
echo "stored values checked: $n"
echo "files: $(find . -type f | wc -l)"
echo "hits: $hits"
exit $hits
