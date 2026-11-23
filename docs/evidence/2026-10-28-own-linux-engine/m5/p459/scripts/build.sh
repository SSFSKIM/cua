#!/bin/bash
# Task 126: the prototype's static musl release binary from a checkout, as linux-engine.yml builds it (cargo build
# --release --locked --target <musl target>, then strip), cargo under the host lock (holder task126 or task126-arm64),
# copied out by its commit with its sha256 and --version; then the wrappers, one per lane, that add each form's
# measurement flag in front of the harness's own arguments (the harness starts `<bin> server ...`).
# usage: build.sh <checkout> <x64|arm64> <holder>
set -u
D=/Users/new/.local/share/cua-171
T=$D/task126
W=$1; arch=$2; holder=$3
case $arch in x64) target=x86_64-unknown-linux-musl ;; arm64) target=aarch64-unknown-linux-musl ;; *) exit 2 ;; esac
sha=$(git -C "$W" rev-parse --short=8 HEAD)
mkdir -p "$T/bin"
cd "$W/native/linux-engine" || exit 2
export CARGO_TARGET_DIR=$T/target-release
"$D/locked.sh" "$holder" timeout -s TERM -k 60 45m /Users/new/.cargo/bin/cargo build --release --locked --target "$target" > "$T/build-$arch-$sha.log" 2>&1
b=$?
[ $b = 0 ] || { echo "build failed ($b): $T/build-$arch-$sha.log"; exit 1; }
out=$T/bin/cua-engine-p459-$arch-$sha
cp "$CARGO_TARGET_DIR/$target/release/cua-engine" "$out"
strip --strip-debug --strip-unneeded "$out"
echo "$out $(sha256sum "$out" | cut -d' ' -f1) $("$out" --version)"
wrap() {
  printf '#!/bin/sh\n# task 126: the prototype %s with %s (a development lane, never released)\nexec %s %s "$@"\n' "$sha" "$2" "$out" "$2" > "$T/bin/$1-$arch-$sha"
  chmod +x "$T/bin/$1-$arch-$sha"
  echo "$T/bin/$1-$arch-$sha"
}
wrap off ""
wrap keepalive "--drag-dnd-release-sync keepalive"
wrap ping "--drag-dnd-release-sync ping"
wrap ping30 "--drag-dnd-release-sync ping --drag-dnd-release-sync-dwell-ms 30"
wrap keepalive-outlasted "--drag-dnd-release-sync keepalive --drag-dnd-release-sync-when outlasted"
wrap ping-outlasted "--drag-dnd-release-sync ping --drag-dnd-release-sync-when outlasted"
