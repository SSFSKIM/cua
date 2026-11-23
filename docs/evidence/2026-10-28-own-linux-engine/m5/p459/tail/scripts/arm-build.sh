#!/bin/bash
# Task 130 on the arm64 VM: the prototype's checkout t130-p459 detached at <commit>, its static musl release binary
# built as linux-engine.yml builds it (cargo under the host lock, holder task130-arm64), stripped, and the lanes'
# wrappers: (b') gated and `tail` gated, from the same binary. Development builds, never released.
# usage: arm-build.sh <commit>
set -u
D=/Users/new/.local/share/cua-171
T=$D/task130
c=$1
mkdir -p "$T/bin" "$T/out"
cd /Users/new/Developer/GitHub/cua || exit 2
git fetch -q origin m5-p459
[ -d .claude/worktrees/t130-p459 ] || git worktree add -q --detach .claude/worktrees/t130-p459 "$c"
W=/Users/new/Developer/GitHub/cua/.claude/worktrees/t130-p459
git -C "$W" checkout -q --detach "$c"
sha=$(git -C "$W" rev-parse --short=8 HEAD)
cd "$W/native/linux-engine" || exit 2
export CARGO_TARGET_DIR=$T/target-release
"$D/locked.sh" task130-arm64 timeout -s TERM -k 60 45m "$D/bin/cargo" build --release --locked --target aarch64-unknown-linux-musl > "$T/build-arm64-$sha.log" 2>&1 || { echo "build failed: $T/build-arm64-$sha.log"; exit 1; }
out=$T/bin/cua-engine-p459-arm64-$sha
cp "$CARGO_TARGET_DIR/aarch64-unknown-linux-musl/release/cua-engine" "$out"
strip --strip-debug --strip-unneeded "$out"
echo "$out $(sha256sum "$out" | cut -d' ' -f1) $("$out" --version)"
wrap() {
  printf '#!/bin/sh\n# task 130: the prototype %s with %s (a development lane, never released)\nexec %s %s "$@"\n' "$sha" "$2" "$out" "$2" > "$T/bin/$1-arm64-$sha"
  chmod +x "$T/bin/$1-arm64-$sha"
  echo "$T/bin/$1-arm64-$sha"
}
wrap ping-outlasted "--drag-dnd-release-sync ping --drag-dnd-release-sync-when outlasted"
wrap tail-outlasted "--drag-dnd-release-sync tail --drag-dnd-release-sync-when outlasted"
