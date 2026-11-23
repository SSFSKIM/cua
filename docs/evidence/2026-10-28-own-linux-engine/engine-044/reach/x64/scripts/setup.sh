#!/bin/bash
# Task 148: the x64 checkout for H9, t148-x64, a fresh worktree detached at H9 = cd03a47b inside the shared checkout's
# .claude/worktrees/. A real `npm ci`, Electron's binary checked, and xprobe built through the cargo wrapper. Under the
# host lock (locked.sh h9-x64).
set -euo pipefail
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/t148-x64
H9=cd03a47bde2a484e1c3ecbf07cc97aada720fda7
cd "$G"
echo "== $(date -u +%FT%TZ) setup at $(git rev-parse HEAD), load $(cut -d' ' -f1-3 /proc/loadavg)"
[ "$(git rev-parse HEAD)" = "$H9" ] || { echo "HEAD is not H9"; exit 1; }
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
