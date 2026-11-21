#!/bin/bash
# Task 123 (from task 105's setup.sh): the t123-x64 checkout, a fresh git worktree detached at H6 69bd7993 (made by
# mk-worktree.sh before this ran), then a real `npm ci`, Electron's binary (electron 44.9.0 ships no install script),
# and xprobe through the cargo wrapper. Run under the host lock (locked.sh task123-x64).
set -euo pipefail
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t123-x64
H6=69bd7993e1f1cb252574939bd6e8e80674bab5b8
cd "$G"
echo "== $(date -u +%FT%TZ) setup at $(git rev-parse HEAD), load $(cut -d' ' -f1-3 /proc/loadavg)"
[ "$(git rev-parse HEAD)" = "$H6" ] || { echo "HEAD is not H6"; exit 1; }
echo "changes before: $(git status --porcelain | wc -l)"
echo "node $(command -v node) $(node --version), npm $(npm --version), $(uname -m)"
npm ci --no-audit --no-fund
node node_modules/electron/install.js
node_modules/electron/dist/electron --version || true
/Users/new/.local/share/cua-171/bin/cargo build --release --manifest-path "$G/scripts/linux-engine-diff/xprobe/Cargo.toml"
ls -la "$G/scripts/linux-engine-diff/xprobe/target/release/xprobe"
echo "changes after: $(git status --porcelain | wc -l)"
echo "== $(date -u +%FT%TZ) setup done"
