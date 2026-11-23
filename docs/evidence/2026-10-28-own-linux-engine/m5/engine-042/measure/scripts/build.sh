#!/bin/bash
# Task 116: the candidate's static musl release binary from a checkout, as linux-engine.yml builds it (cargo build
# --release --locked --target <musl target>, then strip), cargo through the host-lock wrapper under the lock (holder
# m5-measure042, 45 min cap), copied out by its commit with its sha256 and --version.
# usage: build.sh <checkout> <x64|arm64>
set -u
D=/Users/new/.local/share/cua-171
T=$D/task116
W=$1; arch=$2
case $arch in x64) target=x86_64-unknown-linux-musl ;; arm64) target=aarch64-unknown-linux-musl ;; *) exit 2 ;; esac
sha=$(git -C "$W" rev-parse --short=8 HEAD)
mkdir -p "$T/bin"
cd "$W/native/linux-engine" || exit 2
"$D/locked.sh" m5-measure042 timeout -s TERM -k 60 45m "$D/bin/cargo" build --release --locked --target "$target" > "$T/build-$arch-$sha.log" 2>&1
b=$?
[ $b = 0 ] || { echo "build failed ($b): $T/build-$arch-$sha.log"; exit 1; }
out=$T/bin/cua-engine-042-$arch-$sha
cp "target/$target/release/cua-engine" "$out"
strip --strip-debug --strip-unneeded "$out"
echo "$out $(sha256sum "$out" | cut -d' ' -f1) $("$out" --version)"
