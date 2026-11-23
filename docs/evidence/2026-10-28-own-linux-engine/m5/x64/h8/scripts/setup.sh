#!/bin/bash
# Task 135: the x64 checkout for H8, t129-x64 (task 129's worktree inside the shared checkout's .claude/worktrees/),
# moved to H8 = 048140a2 detached. Its node_modules came from a real `npm ci` at ae3fc1e8, and package.json and the
# lockfile are the same at H8, so no npm ci again; Electron's binary and xprobe (its source unchanged since) are
# checked. Under the host lock (locked.sh h8-x64).
set -euo pipefail
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/t129-x64
H8=048140a2bde0f6398cc910c1aa14ecf2e7e51004
cd "$G"
echo "== $(date -u +%FT%TZ) setup at $(git rev-parse HEAD), load $(cut -d' ' -f1-3 /proc/loadavg)"
[ "$(git rev-parse HEAD)" = "$H8" ] || { echo "HEAD is not H8"; exit 1; }
echo "changes: $(git status --porcelain | wc -l)"
echo "package.json and package-lock.json against ae3fc1e8 (the npm ci): $(git diff --stat ae3fc1e8 HEAD -- package.json package-lock.json | wc -l) lines of diff"
echo "xprobe source against ae3fc1e8 (its build): $(git diff --stat ae3fc1e8 HEAD -- scripts/linux-engine-diff/xprobe | wc -l) lines of diff"
echo "node $(command -v node) $(node --version), npm $(npm --version), $(uname -m)"
if [ ! -x node_modules/electron/dist/electron ]; then echo "electron binary missing: installing"; node node_modules/electron/install.js; fi
ls -la node_modules/electron/dist/electron
echo "electron $(cat node_modules/electron/dist/version)"
ls -la scripts/linux-engine-diff/xprobe/target/release/xprobe
google-chrome --version
ls /Users/new/.local/share/cua-171/chrome-stable/
echo "changes after: $(git status --porcelain | wc -l)"
echo "== $(date -u +%FT%TZ) setup done"
