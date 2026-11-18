#!/bin/bash
# Task 98: the harness's prerequisites in a checkout that already stands at the prototype's commit (the x64 host's own
# worktree): npm ci, Electron's binary, xprobe and the engine's release build through the cargo wrapper. Run under the
# host lock (locked.sh m5-l4a).
# usage: setup-here.sh <checkout>
set -euo pipefail
G=$1
D=/Users/new/.local/share/cua-171
cd "$G"
echo "== $(date -u +%FT%TZ) HEAD $(git rev-parse HEAD) $(uname -m) node $(node --version)"
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
