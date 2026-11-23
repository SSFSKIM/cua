#!/bin/bash
# Task 132 (ruling 1026) on the arm64 VM: the handle-tail head's static musl release binary, built as linux-engine.yml
# builds it from a checkout t132-eng detached at <commit> (cargo under the host lock, holder task132-arm64), stripped,
# installed in its own run-owned home (task132/home-arm64-<sha>/engine/linux/), with the 0.4.2-end control wrapper
# (`--drag-dnd-release-sync off`). The harness stays t132-h71 (H7.1's scripts). Development build, never released.
# usage: arm-build-new.sh <commit> [<expected sha256>]
set -u
D=/Users/new/.local/share/cua-171
T=$D/task132
c=$1; want=${2:-}
cd /Users/new/Developer/GitHub/cua || exit 2
git fetch -q origin m5-engine-043
[ -d .claude/worktrees/t132-eng ] || git worktree add -q --detach .claude/worktrees/t132-eng "$c"
W=/Users/new/Developer/GitHub/cua/.claude/worktrees/t132-eng
git -C "$W" checkout -q --detach "$c" || exit 2
sha=$(git -C "$W" rev-parse --short=8 HEAD)
git -C "$W" diff --stat f9d1f86b "$sha"
cd "$W/native/linux-engine" || exit 2
export CARGO_TARGET_DIR=$T/target-release
"$D/locked.sh" task132-arm64 timeout -s TERM -k 60 45m "$D/bin/cargo" build --release --locked --target aarch64-unknown-linux-musl > "$T/build-arm64-$sha.log" 2>&1 || { echo "build failed: $T/build-arm64-$sha.log"; exit 1; }
out=$T/bin/cua-engine-043-arm64-$sha
cp "$CARGO_TARGET_DIR/aarch64-unknown-linux-musl/release/cua-engine" "$out"
strip --strip-debug --strip-unneeded "$out"
got=$(sha256sum "$out" | cut -d' ' -f1)
H=$T/home-arm64-$sha/engine/linux
mkdir -p "$H" && cp "$out" "$H/cua-engine"
printf '#!/bin/sh\n# task 132: %s with --drag-dnd-release-sync off (0.4.2'"'"'s end; a development lane)\nexec %s --drag-dnd-release-sync off "$@"\n' "$sha" "$H/cua-engine" > "$T/bin/off-$sha"
chmod +x "$T/bin/off-$sha"
echo "$out $got $("$out" --version)"
[ -z "$want" ] || [ "$got" = "$want" ] || echo "NOTE: sha256 differs from the expected $want (a local build; compare the source, not the bytes)"
