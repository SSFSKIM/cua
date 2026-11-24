#!/bin/bash
# Task 162: the x64 checkout for H10, t162-x64, a fresh worktree detached at H10 = 2c66966bd inside the shared checkout's
# .claude/worktrees/. A real `npm ci`, Electron's binary checked, and xprobe built through the cargo wrapper. Under the
# host lock (locked.sh h10-x64).
set -euo pipefail
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/t162-x64
H10=2c66966bdab7b29836779401019f43abc6cb9890
cd "$G"
echo "== $(date -u +%FT%TZ) setup at $(git rev-parse HEAD), load $(cut -d' ' -f1-3 /proc/loadavg)"
[ "$(git rev-parse HEAD)" = "$H10" ] || { echo "HEAD is not H10"; exit 1; }
echo "changes before: $(git status --porcelain | wc -l)"
echo "node $(command -v node) $(node --version), npm $(npm --version), $(uname -m)"
npm ci --no-audit --no-fund
[ -x node_modules/electron/dist/electron ] || node node_modules/electron/install.js
ls -la node_modules/electron/dist/electron
echo "electron $(cat node_modules/electron/dist/version)"
/Users/new/.local/share/cua-171/bin/cargo build --release --manifest-path "$G/scripts/linux-engine-diff/xprobe/Cargo.toml"
ls -la "$G/scripts/linux-engine-diff/xprobe/target/release/xprobe"
google-chrome --version
echo "changes after: $(git status --porcelain | wc -l)"
echo "== $(date -u +%FT%TZ) setup done"
