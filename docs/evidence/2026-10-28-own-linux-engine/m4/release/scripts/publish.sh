#!/bin/bash
# task 80, step 1: the release branch at the gated commit, pushed, and linux-engine.yml dispatched on it with publish=true.
# Prints the run id; the watch is a separate call (gh run watch).
set -euo pipefail
WT=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171
C=c55c8e08d9cbbb057b8b95434787b1e45d41184c
B=release/linux-engine-v0.4.0
cd "$WT"
if gh release view linux-engine-v0.4.0 --repo SSFSKIM/cua >/dev/null 2>&1; then echo "linux-engine-v0.4.0 exists: not dispatching" >&2; exit 1; fi
if git ls-remote --exit-code origin "refs/heads/$B" >/dev/null 2>&1; then echo "$B exists on origin: not dispatching" >&2; exit 1; fi
git branch "$B" "$C"
git push origin "$B"
echo "pushed $B at $(git rev-parse "$B")"
gh workflow run linux-engine.yml --repo SSFSKIM/cua --ref "$B" -f commit="$C" -f publish=true
for i in $(seq 1 30); do
  id=$(gh run list --repo SSFSKIM/cua --workflow linux-engine.yml --branch "$B" --event workflow_dispatch --json databaseId,headSha --jq ".[] | select(.headSha==\"$C\") | .databaseId" | head -1)
  if [ -n "$id" ]; then echo "run $id"; exit 0; fi
  sleep 4
done
echo "no run found" >&2
exit 1
