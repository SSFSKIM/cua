#!/bin/bash
# Task 113 on arm64: the measurement build of the checkout's engine (release, no live feature), copied out by its
# commit, and the harness's xprobe built into the same target directory and copied where the harness looks for it.
# Cargo through the host-lock wrapper (holder m5-hold042).
set -u
D=/Users/new/.local/share/cua-171
T=$D/task113
W=/Users/new/Developer/GitHub/cua/.claude/worktrees/t113-hold042
E=$W/native/linux-engine
export PATH=$D/bin:$PATH CUA_LOCK_HOLDER=m5-hold042
cd "$E" || exit 2
cargo build --release --locked > "$T/build-release.log" 2>&1; b=$?
sha=$(git -C "$W" rev-parse --short=8 HEAD)
cp "$E/target/release/cua-engine" "$T/bin/cua-engine-$sha"
CARGO_TARGET_DIR=$E/target/xprobe cargo build --release --manifest-path "$W/scripts/linux-engine-diff/xprobe/Cargo.toml" > "$T/build-xprobe.log" 2>&1; x=$?
mkdir -p "$W/scripts/linux-engine-diff/xprobe/target/release"
cp "$E/target/xprobe/release/xprobe" "$W/scripts/linux-engine-diff/xprobe/target/release/xprobe"
echo "build $b xprobe $x sha $sha $(sha256sum "$T/bin/cua-engine-$sha" | cut -c1-16) $("$T/bin/cua-engine-$sha" --version)"
