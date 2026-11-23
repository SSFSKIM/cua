#!/bin/bash
# Task 109 (from task 99's install-home-h4.sh): the 0.4.1 acceptance home reused at H5 (the pin is unchanged), so no
# install: the engine's sha256 against the brief's digest and the pin, its --version, `file`, the install record, the
# secret store's emptiness (a count), and the pinned rule alone (gate.mjs check --pinned) from the H5 checkout.
set -u
export PATH=/Users/new/.local/share/cua-171/node24/bin:$PATH
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t109-h5
D=/Users/new/.local/share/cua-171/m5
ACC=$D/home-arm64-041
R=$D/install-home-arm64-041
WANT=8850abcb00d6ee47c72ff102e71cac1578bc7c5bccf7249104493a17242efaa0
cd "$G" || exit 2
echo "== head $(git rev-parse HEAD), $(git status --porcelain | wc -l) changes, $(date -u +%FT%TZ), $(uname -m), node $(node --version)"
E=$ACC/engine/linux/cua-engine
ls -la "$E"
s=$(sha256sum "$E" | cut -d' ' -f1)
echo "sha256 $s"
[ "$s" = "$WANT" ] && echo "sha256 equals the brief's 0.4.1 arm64 digest" || echo "sha256 DIFFERS from the brief's $WANT"
node -e 'const p=require(process.argv[1]);console.log("pin arm64", JSON.stringify(p.assets.arm64), p.release ?? "")' "$G/runtime/engine/linux-engine.json"
"$E" --version
file "$E"
cat "$ACC/engine/linux/install.json"; echo
ls "$ACC/runtimes"
echo "--- the run home's secret store: $(ls -A "$R/.config/claude-secrets" | wc -l) entries"
echo "--- gate.mjs check --pinned"
node scripts/linux-engine-gate/gate.mjs check --pinned "$ACC"
code=$?
echo "check exit $code"
exit $code
