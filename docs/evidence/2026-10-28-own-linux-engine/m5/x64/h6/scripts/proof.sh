#!/bin/bash
# Task 123: H6's local proof on x64, the arm brief's two parts: the harness suite (`npm run test:linux-engine-diff`)
# and the harness-dbus gate's lines, through the repo's scripts/linux-engine-gate/local-proof.sh from the t123-x64
# checkout, each part under `locked.sh task123-x64` with its own timeout, hold-sittings stopping later parts.
set -u
D=/Users/new/.local/share/cua-171
W=/Users/new/Developer/GitHub/cua/.claude/worktrees
export PATH=$D/bin:/Users/new/.cargo/bin:$PATH
export PROOF_LOCK="$D/locked.sh task123-x64"
export PROOF_HOLD=$D/hold-sittings
export PROOF_PARTS=harness,harness-dbus
echo "$(date -u +%FT%TZ) node $(command -v node) $(node --version)"
"$W/t123-x64/scripts/linux-engine-gate/local-proof.sh" "$D/task123/proof" "$W/t123-x64"
code=$?
echo "$(date -u +%FT%TZ) proof exit $code"
exit $code
