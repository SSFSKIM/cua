#!/bin/bash
# The harness of a commit exported apart from the shared checkout (git archive), its node_modules linked to the
# checkout's, and xprobe built there (prints the export's path last). Task 68 and its fix wave made theirs with it.
# usage: export-harness.sh <commit>   (exports to $T/harness-<commit>)
set -euo pipefail
. "$(dirname "$0")/env.sh"
commit=$(git -C "$WT" rev-parse --short=8 "$1")
dir=$T/harness-$commit
rm -rf "$dir"
mkdir -p "$dir"
git -C "$WT" archive "$commit" | tar -x -C "$dir"
ln -s "$WT/node_modules" "$dir/node_modules"
mkdir -p "$dir/scripts/linux-engine-diff/xprobe/target"
cp -r "$WT/scripts/linux-engine-diff/xprobe/target/release" "$dir/scripts/linux-engine-diff/xprobe/target/"
cd "$dir/scripts/linux-engine-diff/xprobe"
cargo build --release --offline >&2
echo "$dir"
