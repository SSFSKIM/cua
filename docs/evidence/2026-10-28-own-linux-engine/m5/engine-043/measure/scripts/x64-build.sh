#!/bin/bash
# Task 132 on x64: the candidate's static musl release binary from the m5-measure-043 checkout (at f9d1f86b, the
# candidate's head), as linux-engine.yml builds it, cargo under the host lock (holder task132-x64), stripped, copied
# out by its commit. Development build, never released.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task132
W=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/m5-measure-043
C=f9d1f86b
mkdir -p "$T/bin"
cd "$W/native/linux-engine" || exit 2
export CARGO_TARGET_DIR=$T/target-release
"$D/locked.sh" task132-x64 timeout -s TERM -k 60 45m "$D/bin/cargo" build --release --locked --target x86_64-unknown-linux-musl > "$T/build-x64-$C.log" 2>&1 || { echo "build failed: $T/build-x64-$C.log"; exit 1; }
out=$T/bin/cua-engine-043-x64-$C
cp "$CARGO_TARGET_DIR/x86_64-unknown-linux-musl/release/cua-engine" "$out"
strip --strip-debug --strip-unneeded "$out"
echo "$out $(sha256sum "$out" | cut -d' ' -f1) $("$out" --version)"
