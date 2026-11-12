#!/bin/bash
# A musl build of cua-engine with the `live` feature (its test hooks, never a release asset), otherwise made as task 73's
# build-musl.sh makes the release workflow's: from a commit's tree exported apart from the shared checkout, a hermetic
# Cargo home, the remapped paths, the commit stamped, `--release --locked --target x86_64-unknown-linux-musl`, stripped,
# checked static. The third fix wave's `moved` cell needs its hook (`CUA_ENGINE_FAULT=drag-release-move`).
# usage: build-musl-live.sh <commit>   (builds under $T/build-live/<commit>; prints the binary's path last)
set -euo pipefail
. "$(dirname "$0")/env.sh"
commit=$(git -C "$WT" rev-parse "$1")
root=$T/build-live/$commit
rm -rf "$root"
mkdir -p "$root/src"
git -C "$WT" archive "$commit" native/linux-engine | tar -x -C "$root/src"
cd "$root/src/native/linux-engine"
rustc --version | grep -q '^rustc 1\.94\.1 '
cargo_home="$root/.cargo-home"
mkdir -p "$cargo_home/bin"
: > "$cargo_home/config.toml"
export CARGO_HOME="$cargo_home"
export RUSTUP_HOME="${RUSTUP_HOME:-$HOME/.rustup}"
export RUSTFLAGS="--remap-path-prefix=${cargo_home}=/cargo --remap-path-prefix=$root/src=/cua --remap-path-prefix=$(rustc --print sysroot)=/rust"
export CUA_ENGINE_GIT_SHA="${commit:0:12}"
cargo build --release --locked --target x86_64-unknown-linux-musl --features live >&2
bin="target/x86_64-unknown-linux-musl/release/cua-engine"
strip --strip-debug --strip-unneeded "$bin"
file "$bin" | grep -Eq 'static(-pie|ally) linked'
"$bin" --version >&2
sha256sum "$bin" >&2
echo "$root/src/native/linux-engine/$bin"
