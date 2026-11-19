#!/bin/bash
# Task 105: H''''s local proof on x64, the brief's three parts: npm test at H'''' and at main (ruling 743's comparison),
# the harness suite (`npm run test:linux-engine-diff`) and the harness-dbus gate's lines. The repo's
# scripts/linux-engine-gate/local-proof.sh (task 91, ruling 774) from the t105-x64 checkout, run as is, each part under
# `locked.sh t105-x64` with its own timeout, the hold-sittings file stopping later parts. main's comparison checkout is
# t5-main at b99232de, H''''s merge base with main (the same main T5 compared against).
set -u
D=/Users/new/.local/share/cua-171
W=/Users/new/Developer/GitHub/cua/.claude/worktrees
export PATH=$D/bin:/Users/new/.cargo/bin:$PATH
export PROOF_LOCK="$D/locked.sh t105-x64"
export PROOF_HOLD=$D/hold-sittings
export PROOF_PARTS=npm-test,npm-test-compare,harness,harness-dbus
echo "$(date -u +%FT%TZ) node $(command -v node) $(node --version)"
"$W/t105-x64/scripts/linux-engine-gate/local-proof.sh" "$D/task105/proof" "$W/t105-x64" "$W/t5-main"
code=$?
echo "$(date -u +%FT%TZ) proof exit $code"
exit $code
