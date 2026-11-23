#!/bin/bash
# A musl build of cua-engine made the release workflow's way (.github/workflows/linux-engine.yml, "Build cua-engine"),
# from a commit's engine tree already archived to <root>/engine.tar: a hermetic Cargo home, the remapped paths, the
# commit stamped, `cargo build --release --locked --target x86_64-unknown-linux-musl`, stripped, checked static.
# usage: build-musl-tar.sh <root> <full commit sha>   (prints the binary's path last)
set -euo pipefail
root=$1
commit=$2
rm -rf "$root/src"
mkdir -p "$root/src"
tar -x -C "$root/src" -f "$root/engine.tar"
cd "$root/src/native/linux-engine"
rustc --version | grep -q '^rustc 1\.94\.1 '
cargo_home="$root/.cargo-home"
mkdir -p "$cargo_home/bin"
: > "$cargo_home/config.toml"
export CARGO_HOME="$cargo_home"
export RUSTUP_HOME="${RUSTUP_HOME:-$HOME/.rustup}"
export RUSTFLAGS="--remap-path-prefix=${cargo_home}=/cargo --remap-path-prefix=$root/src=/cua --remap-path-prefix=$(rustc --print sysroot)=/rust"
export CUA_ENGINE_GIT_SHA="${commit:0:12}"
cargo build --release --locked --target x86_64-unknown-linux-musl >&2
bin="target/x86_64-unknown-linux-musl/release/cua-engine"
strip --strip-debug --strip-unneeded "$bin"
file "$bin" >&2
file "$bin" | grep -Eq 'static(-pie|ally) linked'
"$bin" --version >&2
sha256sum "$bin" >&2
echo "$root/src/native/linux-engine/$bin"
