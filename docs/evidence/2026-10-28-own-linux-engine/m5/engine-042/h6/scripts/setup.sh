#!/bin/bash
# task 121: the worktree's node_modules and xprobe, and a run-owned home with the pinned 0.4.2 engine installed
set -u
repo=/Users/new/Developer/GitHub/cua/.claude/worktrees/agent-a4d8cf4660dd54f80
T=/Users/new/.local/share/cua-171/task121
cd "$repo"
npm ci --no-audit --no-fund > "$T/npm-ci.log" 2>&1; echo "npm ci exit $?"
cargo build --release --manifest-path scripts/linux-engine-diff/xprobe/Cargo.toml > "$T/xprobe-build.log" 2>&1; echo "xprobe exit $?"
home=$T/home
mkdir -p "$home"
env -i HOME="$home" PATH="$PATH" LANG=C.UTF-8 node bin/cua.mjs install --engine; echo "install exit $?"
bin="$home/.local/share/cua/engine/linux/cua-engine"
sha256sum "$bin"; "$bin" --version
