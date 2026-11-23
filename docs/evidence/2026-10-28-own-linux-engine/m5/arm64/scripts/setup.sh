#!/bin/bash
# Task 99 (T7, the arm64 judged run; from task 96's and task 89's setup.sh): a checkout made fresh, a git worktree of
# the VM's clone detached and clean at <sha>, then a real `npm ci`, Electron's binary (electron 44.9.0 ships no install
# script), and, unless NO_XPROBE is set, xprobe built through the cargo wrapper (which runs cargo directly inside a held
# lock). Run under the host lock (locked.sh t7-arm64). The run's Node 24.22.1 is first on PATH.
# usage: setup.sh <worktree name> <sha>
set -euo pipefail
NAME=$1; SHA=$2
R=/Users/new/Developer/GitHub/cua
G=$R/.claude/worktrees/$NAME
export PATH=/Users/new/.local/share/cua-171/node24/bin:$PATH
echo "== $(date -u +%FT%TZ) setup $NAME at $SHA, load $(cut -d' ' -f1-3 /proc/loadavg)"
git -C "$R" fetch -q origin
[ -e "$G" ] && { echo "$G exists: a fresh worktree is wanted"; exit 2; }
git -C "$R" worktree add -q --detach "$G" "$SHA"
cd "$G"
echo "== HEAD $(git rev-parse HEAD) (wanted $SHA)"
[ "$(git rev-parse HEAD)" = "$(git rev-parse "$SHA^{commit}")" ] || { echo "HEAD is not $SHA"; exit 1; }
echo "changes before: $(git status --porcelain | wc -l)"
echo "node $(command -v node) $(node --version), npm $(npm --version), $(uname -m)"
npm ci --no-audit --no-fund
node node_modules/electron/install.js
node_modules/electron/dist/electron --version || true
file -b node_modules/electron/dist/electron | cut -c1-100
if [ -z "${NO_XPROBE:-}" ]; then
  /Users/new/.local/share/cua-171/bin/cargo build --release --manifest-path "$G/scripts/linux-engine-diff/xprobe/Cargo.toml"
  ls -la "$G/scripts/linux-engine-diff/xprobe/target/release/xprobe"
  file -b "$G/scripts/linux-engine-diff/xprobe/target/release/xprobe" | cut -c1-100
fi
echo "changes after: $(git status --porcelain | wc -l)"
echo "== $(date -u +%FT%TZ) setup done"
