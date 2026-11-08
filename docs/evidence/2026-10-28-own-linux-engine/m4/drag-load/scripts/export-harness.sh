#!/bin/bash
# The harness of a commit exported apart from the shared checkout (git archive), its node_modules linked to the
# checkout's, and xprobe built there (prints the export's path last).
# usage: export-harness.sh <commit>   (exports to $T/harness-<commit>)
set -euo pipefail
. "$(dirname "$0")/env.sh"
wt=$WT
commit=$(git -C "$wt" rev-parse --short=8 "$1")
dir=$T/harness-$commit
rm -rf "$dir"
mkdir -p "$dir"
git -C "$wt" archive "$commit" | tar -x -C "$dir"
ln -s "$wt/node_modules" "$dir/node_modules"
mkdir -p "$dir/scripts/linux-engine-diff/xprobe/target"
cp -r "$wt/scripts/linux-engine-diff/xprobe/target/release" "$dir/scripts/linux-engine-diff/xprobe/target/"
cd "$dir/scripts/linux-engine-diff/xprobe"
cargo build --release --offline >&2
echo "$dir"
