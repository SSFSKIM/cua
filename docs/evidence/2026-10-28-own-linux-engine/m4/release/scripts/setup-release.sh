#!/bin/bash
# task 80: the release checks' checkout (t80-release, detached at the pin commit): npm ci and the harness's xprobe, as the
# gate checkouts' setup-gate.sh did (no Electron: no check here starts it). Run under locked.sh.
set -euo pipefail
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t80-release
cd "$G"
git rev-parse HEAD
npm ci --no-audit --no-fund
/Users/new/.local/share/cua-171/bin/cargo build --release --manifest-path "$G/scripts/linux-engine-diff/xprobe/Cargo.toml"
ls -la "$G/scripts/linux-engine-diff/xprobe/target/release/xprobe"
echo "porcelain: $(git status --porcelain | wc -l)"
git status --porcelain | head
