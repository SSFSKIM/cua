#!/bin/bash
# task 77: the gate checkout's install: npm ci, Electron's binary (electron 44.9.0 ships no install script), xprobe
set -euo pipefail
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t77-gate
cd "$G"
git rev-parse HEAD
npm ci --no-audit --no-fund
node node_modules/electron/install.js
node_modules/electron/dist/electron --version || true
git status --porcelain | head
/Users/new/.local/share/cua-171/bin/cargo build --release --manifest-path "$G/scripts/linux-engine-diff/xprobe/Cargo.toml"
ls -la "$G/scripts/linux-engine-diff/xprobe/target/release/xprobe"
git status --porcelain | wc -l
