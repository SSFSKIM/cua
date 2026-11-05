#!/bin/bash
# The scratch harness (task 22 step A): the worktree's harness copied, xprobe linked, then patched by patch-harness.py.
set -eu
WT=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171
H=/Users/new/.local/share/cua-171/task22/scratch/harness/scripts
mkdir -p "$H"
rsync -a --delete --exclude xprobe/target "$WT/scripts/linux-engine-diff" "$H/"
cp "$WT/scripts/linux-engine-diff.mjs" "$H/"
mkdir -p "$H/linux-engine-diff/xprobe/target/release"
ln -sf "$WT/scripts/linux-engine-diff/xprobe/target/release/xprobe" "$H/linux-engine-diff/xprobe/target/release/xprobe"
python3 /Users/new/.local/share/cua-171/task22/scratch/patch-harness.py "$H/linux-engine-diff/run.mjs"
echo made
