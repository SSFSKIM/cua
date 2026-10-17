#!/bin/sh
# Builds the seatbelt golden generator against the original's crates and writes test/fixtures/sandbox/seatbelt/
# (#115 M0). Dev-only, macOS (the mini; never part of the test suite or a release).
#
#   scripts/sandbox-golden/generate.sh [<upstream checkout>] [generate.mjs options, e.g. --check <file>]
#
# The upstream checkout is openai/codex at rust-v0.159.2. Without one, it is cloned (blobless) into
# $HOME/.cache/cua-sandbox-golden/codex. A given checkout must already be at that commit: this script never moves it.
# The generator links that checkout's crates by path (Cargo.toml's `upstream` symlink, pointed here), builds with the
# checkout's own Cargo.lock and the toolchain upstream pins (rust-toolchain.toml), into
# $HOME/.cache/cua-sandbox-golden/target unless CARGO_TARGET_DIR says otherwise.
set -eu
COMMIT=ff6aec96948b70d94983af2641a6b67c94faeff5
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../.." && pwd)
CACHE="$HOME/.cache/cua-sandbox-golden"

UPSTREAM=""
case "${1-}" in -*|"") ;; *) UPSTREAM=$1; shift ;; esac
if [ -z "$UPSTREAM" ]; then
  UPSTREAM="$CACHE/codex"
  if [ ! -d "$UPSTREAM/.git" ]; then
    mkdir -p "$CACHE"
    git clone --filter=blob:none https://github.com/openai/codex "$UPSTREAM"
    git -C "$UPSTREAM" checkout -q --detach "$COMMIT"
  fi
fi
UPSTREAM=$(cd "$UPSTREAM" && pwd)
HEAD=$(git -C "$UPSTREAM" rev-parse HEAD)
if [ "$HEAD" != "$COMMIT" ]; then
  echo "generate.sh: $UPSTREAM is at $HEAD, not rust-v0.159.2 ($COMMIT)" >&2
  exit 1
fi

ln -sfn "$UPSTREAM" "$HERE/upstream"
cp "$UPSTREAM/codex-rs/Cargo.lock" "$HERE/Cargo.lock"
TARGET=${CARGO_TARGET_DIR:-$CACHE/target}
(cd "$HERE" && CARGO_TARGET_DIR="$TARGET" cargo build --release --quiet)
node "$HERE/generate.mjs" --generator "$TARGET/release/cua-sandbox-golden" --out "$REPO/test/fixtures/sandbox/seatbelt" "$@"
