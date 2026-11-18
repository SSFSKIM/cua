#!/bin/bash
# Task 99 (T7): H'''s local proof on arm64, before any counted step: the repo's scripts/linux-engine-gate/local-proof.sh
# (task 91, ruling 774) from the T7 checkout, run as is, each part under `locked.sh t7-arm64` with its own timeout, the
# hold-sittings file stopping later parts. main's comparison checkout (t7-main) is named for ruling 743's npm test
# comparison. The run's Node 24.22.1 first on PATH; cargo through the VM's wrapper (it runs cargo directly inside a held
# lock), rustup from ~/.cargo/bin.
set -u
D=/Users/new/.local/share/cua-171
W=/Users/new/Developer/GitHub/cua/.claude/worktrees
export PATH=$D/node24/bin:$D/bin:/Users/new/.cargo/bin:$PATH
export PROOF_LOCK="$D/locked.sh t7-arm64"
export PROOF_HOLD=$D/hold-sittings
echo "$(date -u +%FT%TZ) node $(command -v node) $(node --version); cargo $(command -v cargo); rustup $(command -v rustup)"
"$W/t7-arm64/scripts/linux-engine-gate/local-proof.sh" "$D/task99/proof" "$W/t7-arm64" "$W/t7-main"
code=$?
echo "$(date -u +%FT%TZ) proof exit $code"
exit $code
