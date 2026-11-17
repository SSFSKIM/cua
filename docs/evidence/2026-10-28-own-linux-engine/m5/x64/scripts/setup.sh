#!/bin/bash
# task 89 (from task 87's setup-pilot.sh): a checkout's install, run under the lock: npm ci, Electron's binary
# (electron 44.9.0 ships no install script), and xprobe (T5's checkout only; pass --no-xprobe for main's)
# usage: setup.sh <worktree> [--no-xprobe]
set -euo pipefail
G=$1
cd "$G"
echo "HEAD $(git rev-parse HEAD)"
echo "changes before: $(git status --porcelain | wc -l)"
npm ci --no-audit --no-fund
node node_modules/electron/install.js
node_modules/electron/dist/electron --version || true
if [ "${2:-}" != "--no-xprobe" ]; then
  /Users/new/.local/share/cua-171/bin/cargo build --release --manifest-path "$G/scripts/linux-engine-diff/xprobe/Cargo.toml"
  ls -la "$G/scripts/linux-engine-diff/xprobe/target/release/xprobe"
fi
echo "changes after: $(git status --porcelain | wc -l)"
