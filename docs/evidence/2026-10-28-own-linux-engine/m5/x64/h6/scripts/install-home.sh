#!/bin/bash
# Task 123 (from task 105's install-home.sh): the x64 acceptance home for H6 on 0.4.2. Its own `cua install` (from the
# t123-x64 checkout at H6) places the pinned runtime and linux-engine-v0.4.2 in CUA_HOME, under a HOME and XDG
# directories of the run's with an empty secret store. Then the engine's hash against the pin and the brief's x64
# sha256, its --version, `file`, the install record, and the pinned rule alone (gate.mjs check --pinned). Under the
# host lock.
set -euo pipefail
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t123-x64
D=/Users/new/.local/share/cua-171/m5
ACC=$D/home-x64-042
R=$D/install-home-x64-042
WANT=a1314106a388167191670d38c0b67292617fe0f7e929f133ff7343b4a8a85a78
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
got=$(sha256sum "$E" | cut -d' ' -f1)
echo "sha256 $got"
if [ "$got" = "$WANT" ]; then echo "sha256 equals the brief's x64 asset"; else echo "sha256 DIFFERS from the brief's $WANT"; exit 1; fi
node -e 'const p=require(process.argv[1]);console.log("pin", JSON.stringify(p))' "$G/runtime/engine/linux-engine.json" | cut -c1-600
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
