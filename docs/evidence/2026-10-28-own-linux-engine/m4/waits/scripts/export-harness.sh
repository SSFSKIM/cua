#!/bin/bash
# The harness of a commit exported apart from the shared checkout (git archive), its node_modules linked to the
# checkout's, and xprobe built there (prints the export's path last).
# usage: export-harness.sh <commit>
set -euo pipefail
wt=$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171
commit=$(git -C "$wt" rev-parse --short=8 "$1")
dir=$HOME/.local/share/cua-171/task64/harness-$commit
rm -rf "$dir"
mkdir -p "$dir"
git -C "$wt" archive "$commit" | tar -x -C "$dir"
ln -s "$wt/node_modules" "$dir/node_modules"
(cd "$dir/scripts/linux-engine-diff/xprobe" && cargo build --release --offline >&2)
echo "$dir"
