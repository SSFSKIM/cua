#!/bin/bash
# A musl build of cua-engine made the release workflow's way (.github/workflows/linux-engine.yml, "Build cua-engine"),
# from a commit's tree exported apart from the shared checkout: a hermetic Cargo home, the remapped paths, the commit
# stamped, `cargo build --release --locked --target x86_64-unknown-linux-musl`, stripped, checked static.
# usage: build-musl.sh <commit>   (prints the binary's path last)
set -euo pipefail
commit=$(git -C $HOME/Developer/GitHub/cua/.claude/worktrees/cua-171 rev-parse "$1")
root=$HOME/.local/share/cua-171/task60-fix/build/$commit
rm -rf "$root"
mkdir -p "$root/src"
git -C $HOME/Developer/GitHub/cua/.claude/worktrees/cua-171 archive "$commit" native/linux-engine | tar -x -C "$root/src"
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
