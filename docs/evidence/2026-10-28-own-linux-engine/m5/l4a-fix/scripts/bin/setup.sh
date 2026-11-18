#!/bin/bash
# Task 98 (from task 96's setup.sh): this task's own checkout on a VM, a git worktree of the VM's clone detached at the
# prototype's commit, beside task 96's (which is read, never changed): npm ci, Electron's binary, xprobe and the
# engine's release build through the cargo wrapper. Run under the host lock (locked.sh m5-l4a).
# usage: setup.sh <sha> [worktree name, default t98-l4a]
set -euo pipefail
SHA=$1
NAME=${2:-t98-l4a}
D=/Users/new/.local/share/cua-171
R=/Users/new/Developer/GitHub/cua
G=$R/.claude/worktrees/$NAME
[ -x "$D/node24/bin/node" ] && export PATH=$D/node24/bin:$PATH
if [ -d "$G" ]; then
  git -C "$R" fetch -q origin m5-l4a-fix
  git -C "$G" checkout -q --detach "$SHA"
else
  git -C "$R" fetch -q origin m5-l4a-fix
  git -C "$R" worktree add -q --detach "$G" "$SHA"
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
ls -la "$G/scripts/linux-engine-diff/xprobe/target/release/xprobe" "$G/native/linux-engine/target/release/cua-engine"
"$G/native/linux-engine/target/release/cua-engine" --version
sha256sum "$G/native/linux-engine/target/release/cua-engine"
echo "changes: $(git status --porcelain | wc -l)"
echo "== $(date -u +%FT%TZ) setup done"
