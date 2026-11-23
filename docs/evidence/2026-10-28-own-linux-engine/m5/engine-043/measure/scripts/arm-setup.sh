#!/bin/bash
# Task 132 on the arm64 VM: the harness checkout t132-h71 detached at the candidate f9d1f86b (H7.1's harness:
# 96fa1fd3's scripts unchanged, plus the candidate's engine), xprobe copied from t131-h71's build of the same
# source, npm ci and the candidate's static musl release build under the host lock (holder task132-arm64).
# Development builds, never released.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task132
C=f9d1f86b
mkdir -p "$T/bin" "$T/out"
cd /Users/new/Developer/GitHub/cua || exit 2
git fetch -q origin m5-engine-043
[ -d .claude/worktrees/t132-h71 ] || git worktree add -q --detach .claude/worktrees/t132-h71 "$C"
W=/Users/new/Developer/GitHub/cua/.claude/worktrees/t132-h71
[ "$(git -C "$W" rev-parse --short=8 HEAD)" = "$C" ] || { echo "t132-h71 not at $C"; exit 2; }
# the scripts are H7.1's: no change under scripts/ from 96fa1fd3
[ -z "$(git -C "$W" diff --stat 96fa1fd3 "$C" -- scripts)" ] || { echo "scripts differ from 96fa1fd3"; exit 2; }
X=/Users/new/Developer/GitHub/cua/.claude/worktrees/t131-h71
[ -z "$(git -C "$W" diff --stat "$(git -C "$X" rev-parse HEAD)" "$C" -- scripts/linux-engine-diff/xprobe)" ] || { echo "xprobe source differs from t131-h71's"; exit 2; }
mkdir -p "$W/scripts/linux-engine-diff/xprobe/target/release"
cp "$X/scripts/linux-engine-diff/xprobe/target/release/xprobe" "$W/scripts/linux-engine-diff/xprobe/target/release/xprobe"
export PATH=$D/node24/bin:$PATH
[ -d "$W/node_modules" ] || "$D/locked.sh" task132-arm64 bash -c "cd '$W' && npm ci --no-audit --no-fund > '$T/npm-ci.log' 2>&1" || { echo "npm ci failed: $T/npm-ci.log"; exit 1; }
cd "$W/native/linux-engine" || exit 2
export CARGO_TARGET_DIR=$T/target-release
"$D/locked.sh" task132-arm64 timeout -s TERM -k 60 45m "$D/bin/cargo" build --release --locked --target aarch64-unknown-linux-musl > "$T/build-arm64-$C.log" 2>&1 || { echo "build failed: $T/build-arm64-$C.log"; exit 1; }
out=$T/bin/cua-engine-043-arm64-$C
cp "$CARGO_TARGET_DIR/aarch64-unknown-linux-musl/release/cua-engine" "$out"
strip --strip-debug --strip-unneeded "$out"
echo "$out $(sha256sum "$out" | cut -d' ' -f1) $("$out" --version)"
