#!/bin/bash
# Task 129: the x64 checkout for H7, t129-x64, a fresh worktree detached at H7 = ae3fc1e8 inside the shared checkout's
# .claude/worktrees/ (the session's worktree isolation refuses git in t123-x64, and task 126 runs from t123-x64 at H6, so
# moving it would change another task's checkout). Then a real `npm ci` (the lockfile is the same as H6's), Electron's
# binary, and xprobe through the cargo wrapper. Run under the host lock (locked.sh task129-x64).
set -euo pipefail
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/t129-x64
H7=ae3fc1e80685e192fd75d01a71ac14c034992a77
cd "$G"
echo "== $(date -u +%FT%TZ) setup at $(git rev-parse HEAD), load $(cut -d' ' -f1-3 /proc/loadavg)"
[ "$(git rev-parse HEAD)" = "$H7" ] || { echo "HEAD is not H7"; exit 1; }
echo "changes before: $(git status --porcelain | wc -l)"
echo "node $(command -v node) $(node --version), npm $(npm --version), $(uname -m)"
npm ci --no-audit --no-fund
node node_modules/electron/install.js
node_modules/electron/dist/electron --version || true
/Users/new/.local/share/cua-171/bin/cargo build --release --manifest-path "$G/scripts/linux-engine-diff/xprobe/Cargo.toml"
ls -la "$G/scripts/linux-engine-diff/xprobe/target/release/xprobe"
echo "changes after: $(git status --porcelain | wc -l)"
echo "== $(date -u +%FT%TZ) setup done"
