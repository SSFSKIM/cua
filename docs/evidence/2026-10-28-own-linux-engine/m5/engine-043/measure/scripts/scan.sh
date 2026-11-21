#!/bin/bash
# Task 132 (from task 130's scan.sh): secret-shape scan of the evidence directory, gzipped and tarred files included;
# prints counts only.
set -u
E=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/m5-measure-043/docs/evidence/2026-10-28-own-linux-engine/m5/engine-043/measure
pat='sk-[A-Za-z0-9]{20}|gh[pousr]_[A-Za-z0-9]{20}|PLAYWRIGHT_MCP_EXTENSION_TOKEN|PRIVATE KEY|xox[bp]-|AKIA[0-9A-Z]{16}'
n=0
while IFS= read -r f; do
  case $f in
    */scripts/scan.sh) continue ;;  # its own pattern
    *.tgz|*.tar.gz) c=$(tar -xzOf "$f" | grep -c -E "$pat") ;;
    *.gz) c=$(zcat "$f" | grep -c -E "$pat") ;;
    *) c=$(grep -c -E "$pat" "$f") ;;
  esac
  [ "$c" != 0 ] && { echo "finding in $f: $c"; n=$((n + c)); }
done < <(find "$E" -type f)
echo "secret-shape findings: $n"
