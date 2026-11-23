#!/bin/bash
# Task 130: secret-shape scan of the evidence directory, gzipped and tarred files included; prints counts only.
set -u
E=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/m5-p459/docs/evidence/2026-10-28-own-linux-engine/m5/p459/tail
pat='sk-[A-Za-z0-9]{20}|gh[pousr]_[A-Za-z0-9]{20}|PLAYWRIGHT_MCP_EXTENSION_TOKEN|PRIVATE KEY|xox[bp]-'
n=0
for f in $(find "$E" -type f); do
  case $f in
    *.tgz) c=$(tar -xzOf "$f" | grep -c -E "$pat") ;;
    *.gz) c=$(zcat "$f" | grep -c -E "$pat") ;;
    *) c=$(grep -c -E "$pat" "$f") ;;
  esac
  [ "$c" != 0 ] && { echo "finding in $f: $c"; n=$((n + c)); }
done
echo "secret-shape findings: $n"
