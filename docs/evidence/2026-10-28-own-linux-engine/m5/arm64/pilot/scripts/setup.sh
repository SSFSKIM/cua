#!/bin/bash
# Task 96 (T6 arm64, pre-flight §7.2 item 8; T5's setup.sh for the form): the pilot's checkout, a fresh git worktree of
# the VM's clone detached and clean at the VM's head, then npm ci, Electron's binary (electron 44.9.0 ships no install
# script), and xprobe built through the cargo wrapper. Run under the host lock (locked.sh t96-arm64).
# usage: setup.sh <sha>
set -euo pipefail
SHA=$1
R=/Users/new/Developer/GitHub/cua
G=$R/.claude/worktrees/t96-arm64
[ -d "$G" ] || git -C "$R" worktree add -q --detach "$G" "$SHA"
cd "$G"
echo "== $(date -u +%FT%TZ) HEAD $(git rev-parse HEAD) (wanted $SHA)"
[ "$(git rev-parse HEAD)" = "$(git rev-parse "$SHA^{commit}")" ] || { echo "HEAD is not $SHA"; exit 1; }
echo "changes before: $(git status --porcelain | wc -l)"
echo "node $(node --version), npm $(npm --version), $(uname -m)"
npm ci --no-audit --no-fund
node node_modules/electron/install.js
node_modules/electron/dist/electron --version || true
file -b node_modules/electron/dist/electron | cut -c1-100
/Users/new/.local/share/cua-171/bin/cargo build --release --manifest-path "$G/scripts/linux-engine-diff/xprobe/Cargo.toml"
ls -la "$G/scripts/linux-engine-diff/xprobe/target/release/xprobe"
file -b "$G/scripts/linux-engine-diff/xprobe/target/release/xprobe" | cut -c1-100
echo "changes after: $(git status --porcelain | wc -l)"
echo "== $(date -u +%FT%TZ) setup done"
