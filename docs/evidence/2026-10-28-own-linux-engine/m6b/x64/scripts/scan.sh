#!/bin/bash
# Before the commit: every new or changed file of m6b/ scanned for raw U+2028/U+2029 bytes and for credential shapes.
T=/Users/new/.local/share/cua-171/t173
W=$(cd "$T/wt" && pwd -P)
cd "$W" || exit 2
files=$(git status --porcelain --untracked-files=all | awk '{print $2}')
n=0; ls=0; cred=0
for f in $files; do
  n=$((n+1))
  if LC_ALL=C grep -q -P '\xe2\x80[\xa8\xa9]' "$f"; then echo "raw LS/PS: $f"; ls=$((ls+1)); fi
  if grep -q -E 'gh[pousr]_[A-Za-z0-9]{20,}|github_pat_|jwt=|[?&]sig=|X-Amz-|BEGIN [A-Z ]*PRIVATE KEY|PLAYWRIGHT_MCP_EXTENSION_TOKEN=' "$f"; then echo "credential shape: $f"; cred=$((cred+1)); fi
done
echo "$n files scanned: $ls with raw U+2028/U+2029, $cred with a credential shape"
git status --porcelain | grep -v '^?? docs/evidence/2026-10-28-own-linux-engine/m6b/' | grep -v '^ M docs/evidence/2026-10-28-own-linux-engine/m6b/' && echo "SOMETHING OUTSIDE m6b/" || echo "only m6b/ changed"
