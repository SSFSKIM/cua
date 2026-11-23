#!/bin/bash
# Task 99 (T7 part 2, at H''''; from install-home.sh): the fresh acceptance home for 0.4.1. Its own `cua install` (from
# the T7 H'''' checkout) places the pinned runtime and linux-engine-v0.4.1 in CUA_HOME, under a HOME and XDG
# directories of the run's with an empty secret store. Then the engine's hash against the pin and the brief's digest,
# its --version, `file`, the install record, and the pinned rule alone (gate.mjs check --pinned). Under the host lock.
set -euo pipefail
export PATH=/Users/new/.local/share/cua-171/node24/bin:$PATH
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t7-h4
D=/Users/new/.local/share/cua-171/m5
ACC=$D/home-arm64-041
R=$D/install-home-arm64-041
WANT=8850abcb00d6ee47c72ff102e71cac1578bc7c5bccf7249104493a17242efaa0
[ -e "$ACC" ] && { echo "$ACC exists: the acceptance home is installed once"; exit 2; }
mkdir -p "$R/.config" "$R/.local/share" "$R/.local/state" "$R/.cache" "$ACC"
mkdir -m 700 "$R/.config/claude-secrets"
cd "$G"
echo "== head $(git rev-parse HEAD), $(date -u +%FT%TZ), $(uname -m), node $(node --version)"
env -u CUA_LINUX_ENGINE_BIN -u CUA_NATIVE_ENGINE HOME="$R" XDG_CONFIG_HOME="$R/.config" XDG_DATA_HOME="$R/.local/share" \
  XDG_STATE_HOME="$R/.local/state" XDG_CACHE_HOME="$R/.cache" CUA_HOME="$ACC" node bin/cua.mjs install
E=$ACC/engine/linux/cua-engine
echo "--- engine"
ls -la "$E"
s=$(sha256sum "$E" | cut -d' ' -f1)
echo "sha256 $s"
[ "$s" = "$WANT" ] && echo "sha256 equals the brief's 0.4.1 arm64 digest" || echo "sha256 DIFFERS from the brief's $WANT"
node -e 'const p=require(process.argv[1]);console.log("pin arm64", JSON.stringify(p.assets.arm64), p.release ?? "")' "$G/runtime/engine/linux-engine.json"
"$E" --version
file "$E"
cat "$ACC/engine/linux/install.json"
echo
ls "$ACC/runtimes"
echo "--- the secret store is empty: $(ls -A "$R/.config/claude-secrets" | wc -l) entries"
echo "--- gate.mjs check --pinned"
set +e
node scripts/linux-engine-gate/gate.mjs check --pinned "$ACC"
code=$?
echo "check exit $code"
exit $code
