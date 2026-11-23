#!/bin/bash
# Task 148: home-x64-044 (task 145's install from the pin) checked again from the H9 checkout: the engine's sha256
# against the pin, its --version, the install record, and gate.mjs check --pinned. Under the host lock.
set -uo pipefail
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/t148-x64
ACC=/Users/new/.local/share/cua-171/m5/home-x64-044
cd "$G"
WANT=$(node -e 'console.log(require(process.argv[1]).assets.x64.sha256)' "$G/runtime/engine/linux-engine.json")
echo "== head $(git rev-parse HEAD), $(date -u +%FT%TZ), $(uname -m); pin x64 $WANT"
E=$ACC/engine/linux/cua-engine
ls -la "$E"
got=$(sha256sum "$E" | cut -d' ' -f1)
echo "sha256 $got"
if [ "$got" = "$WANT" ]; then echo "sha256 equals the pin"; else echo "sha256 DIFFERS from the pin"; exit 1; fi
"$E" --version
file "$E"
cat "$ACC/engine/linux/install.json"; echo
ls "$ACC/runtimes"
echo "--- gate.mjs check --pinned"
node scripts/linux-engine-gate/gate.mjs check --pinned "$ACC"
code=$?
echo "check exit $code"
exit $code
