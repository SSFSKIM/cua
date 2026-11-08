#!/bin/bash
# A musl build of cua-engine from the shared checkout's working tree (uncommitted changes included), made the release
# workflow's way (build-musl.sh) but labelled a development build: for probes and development sittings only.
# usage: build-tree.sh <name>   (links bin/<name> to the binary, prints its path last)
set -euo pipefail
wt=$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171
root=$HOME/.local/share/cua-171/task66/build/tree-$1
rm -rf "$root"
mkdir -p "$root/src/native"
cp -r "$wt/native/linux-engine" "$root/src/native/"
rm -rf "$root/src/native/linux-engine/target"
cd "$root/src/native/linux-engine"
rustc --version | grep -q '^rustc 1\.94\.1 '
cargo_home="$root/.cargo-home"
mkdir -p "$cargo_home/bin"
: > "$cargo_home/config.toml"
export CARGO_HOME="$cargo_home"
export RUSTUP_HOME="${RUSTUP_HOME:-$HOME/.rustup}"
export RUSTFLAGS="--remap-path-prefix=${cargo_home}=/cargo --remap-path-prefix=$root/src=/cua --remap-path-prefix=$(rustc --print sysroot)=/rust"
export CUA_ENGINE_GIT_SHA="tree-$1"
cargo build --release --locked --target x86_64-unknown-linux-musl >&2
bin="target/x86_64-unknown-linux-musl/release/cua-engine"
strip --strip-debug --strip-unneeded "$bin"
file "$bin" | grep -Eq 'static(-pie|ally) linked'
"$bin" --version >&2
sha256sum "$bin" >&2
ln -sf "$root/src/native/linux-engine/$bin" "$HOME/.local/share/cua-171/task66/bin/$1"
echo "$root/src/native/linux-engine/$bin"
