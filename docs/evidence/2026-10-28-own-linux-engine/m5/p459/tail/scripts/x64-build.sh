#!/bin/bash
# Task 130 on x64: the prototype's static musl release binary from the m5-p459 checkout, as linux-engine.yml builds it,
# cargo under the host lock (holder task130-x64), stripped, copied out by its commit. Development build, never released.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task130
W=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/m5-p459
sha=$(git -C "$W" rev-parse --short=8 HEAD)
cd "$W/native/linux-engine" || exit 2
export CARGO_TARGET_DIR=$T/target-release
"$D/locked.sh" task130-x64 timeout -s TERM -k 60 45m "$D/bin/cargo" build --release --locked --target x86_64-unknown-linux-musl > "$T/build-x64-$sha.log" 2>&1 || { echo "build failed: $T/build-x64-$sha.log"; exit 1; }
out=$T/bin/cua-engine-p459-x64-$sha
cp "$CARGO_TARGET_DIR/x86_64-unknown-linux-musl/release/cua-engine" "$out"
strip --strip-debug --strip-unneeded "$out"
echo "$out $(sha256sum "$out" | cut -d' ' -f1) $("$out" --version)"
