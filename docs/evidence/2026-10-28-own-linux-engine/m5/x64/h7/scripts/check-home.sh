#!/bin/bash
# Task 129: home-x64-042 (task 123's acceptance home, its own `cua install` of linux-engine-v0.4.2) checked again at H7:
# the engine's sha256 against the pin's x64 asset in the t129-x64 checkout, its --version, `file`, install.json, then
# the pinned rule alone (gate.mjs check --pinned) from the checkout at H7. Under the host lock.
set -u
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/t129-x64
ACC=/Users/new/.local/share/cua-171/m5/home-x64-042
E=$ACC/engine/linux/cua-engine
cd "$G"
echo "== $(date -u +%FT%TZ) head $(git rev-parse HEAD), $(uname -m)"
want=$(node -e 'console.log(require(process.argv[1]).assets.x64.sha256)' "$G/runtime/engine/linux-engine.json")
got=$(sha256sum "$E" | cut -d' ' -f1)
echo "pin x64 sha256  $want"
echo "home's engine   $got"
if [ "$got" = "$want" ]; then echo "sha256 equals the pin"; else echo "sha256 DIFFERS from the pin"; exit 1; fi
"$E" --version
file "$E"
cat "$ACC/engine/linux/install.json"; echo
ls "$ACC/runtimes"
echo "--- gate.mjs check --pinned"
node scripts/linux-engine-gate/gate.mjs check --pinned "$ACC"
code=$?
echo "check exit $code"
exit $code
