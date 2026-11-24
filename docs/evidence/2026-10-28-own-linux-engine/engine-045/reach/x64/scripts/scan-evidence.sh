#!/bin/bash
# Task 123 (task 105's, unchanged; from task 89, from task 87, from task 79's scan-evidence.sh): an evidence directory scanned before it is committed, for token-shaped
# strings. It prints file names and counts only, never a matching line. Unlike task 79's, it does not read the stored
# secret values: this task's brief forbids reading secrets, and no step ran with a secret store but empty run-owned ones.
# usage: scan-evidence.sh <dir>
set -u
DST=$1
cd "$DST" || exit 2
PAT='ghp_[A-Za-z0-9]{20}|gho_[A-Za-z0-9]{20}|ghs_[A-Za-z0-9]{20}|github_pat_|PLAYWRIGHT_MCP_EXTENSION_TOKEN=[^ "]|BEGIN (RSA|EC|OPENSSH)? ?PRIVATE KEY|sk-[A-Za-z0-9_-]{20}|xox[abp]-[A-Za-z0-9-]{10}|AKIA[0-9A-Z]{16}'
hits=0
echo "token-shaped, plain:"; r=$(grep -rIlE "$PAT" . | grep -v 'scripts/scan-evidence.sh' | head); [ -n "$r" ] && { echo "$r"; hits=1; }
echo "token-shaped, gz:"; r=$(find . -name '*.gz' -print0 | xargs -0 -r zgrep -lE "$PAT" | head); [ -n "$r" ] && { echo "$r"; hits=1; }
echo "files: $(find . -type f | wc -l)"
echo "hits: $hits"
exit $hits
