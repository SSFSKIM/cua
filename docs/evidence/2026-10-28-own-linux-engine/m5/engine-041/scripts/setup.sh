#!/bin/bash
# Task 101 (from task 98's setup.sh): this task's own checkout on a VM, a git worktree of the VM's clone detached at the
# candidate's commit (never T7's or task 98's): npm ci, Electron's binary, xprobe and the engine's release build through
# the cargo wrapper. Run under the host lock (locked.sh m5-engine041).
# usage: setup.sh <sha> [worktree name, default t101-041]   (T101_CHECKOUT: an existing checkout, used as it is)
set -euo pipefail
SHA=$1
NAME=${2:-t101-041}
D=/Users/new/.local/share/cua-171
R=/Users/new/Developer/GitHub/cua
G=${T101_CHECKOUT:-$R/.claude/worktrees/$NAME}
[ -x "$D/node24/bin/node" ] && export PATH=$D/node24/bin:$PATH
if [ -z "${T101_CHECKOUT:-}" ]; then
  git -C "$R" fetch -q origin m5-engine-041
  if [ -d "$G" ]; then git -C "$G" checkout -q --detach "$SHA"; else git -C "$R" worktree add -q --detach "$G" "$SHA"; fi
fi
cd "$G"
echo "== $(date -u +%FT%TZ) HEAD $(git rev-parse HEAD) (wanted $SHA) $(uname -m)"
[ "$(git rev-parse HEAD)" = "$(git rev-parse "$SHA^{commit}")" ] || { echo "HEAD is not $SHA"; exit 1; }
echo "node $(node --version), npm $(npm --version)"
if [ ! -d node_modules ]; then
  npm ci --no-audit --no-fund
  node node_modules/electron/install.js
fi
node_modules/electron/dist/electron --version || true
"$D/bin/cargo" build --release --manifest-path "$G/scripts/linux-engine-diff/xprobe/Cargo.toml"
"$D/bin/cargo" build --release --manifest-path "$G/native/linux-engine/Cargo.toml"
"$G/native/linux-engine/target/release/cua-engine" --version
sha256sum "$G/native/linux-engine/target/release/cua-engine"
echo "changes: $(git status --porcelain | wc -l)"
echo "== $(date -u +%FT%TZ) setup done"
