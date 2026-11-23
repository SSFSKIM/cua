#!/bin/bash
# The engine-stop burst lane's control, built as the design session ruled (2026-11-06, ruling 1): cua of the given
# commit, its service and its settle included, with only the REPL host's stop as it was before T7b, the three files
# T7b changed in src/repl-host/ taken from f59575fb (kernel-child.mjs's stopProcessTree and reaper, supervisor.mjs's
# launcher shim, trusted-worker.mjs's held record). Exported apart from the shared checkout, its node_modules linked to
# the checkout's; prints its path last. Harness only: nothing of cua is changed.
# usage: control-tree.sh <commit>
set -euo pipefail
wt=$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171
commit=$(git -C "$wt" rev-parse --short=8 "$1")
dir=$HOME/.local/share/cua-171/task62fix/control-$commit
rm -rf "$dir"
mkdir -p "$dir"
git -C "$wt" archive "$commit" | tar -x -C "$dir"
for f in src/repl-host/kernel-child.mjs src/repl-host/supervisor.mjs src/repl-host/trusted-worker.mjs; do
  git -C "$wt" show "f59575fb:$f" > "$dir/$f"
done
ln -s "$wt/node_modules" "$dir/node_modules"
# what differs from the commit: the three stop files, nothing else
git -C "$wt" diff --stat "$commit" f59575fb -- src/repl-host >&2
echo "$dir"
