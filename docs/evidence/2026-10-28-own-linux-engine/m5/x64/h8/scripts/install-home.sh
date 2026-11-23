#!/bin/bash
# Task 135 (from task 123's install-home.sh): the x64 acceptance home for H8 on 0.4.3. Its own `cua install --engine`
# (from the t129-x64 checkout at H8) places the pinned runtime and linux-engine-v0.4.3 in CUA_HOME, under a HOME and XDG
# directories of the run's with an empty secret store. Then the engine's hash against the pin, its --version, `file`,
# the install record, and the pinned rule alone (gate.mjs check --pinned). Under the host lock.
set -euo pipefail
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/t129-x64
D=/Users/new/.local/share/cua-171/m5
ACC=$D/home-x64-043
R=$D/install-home-x64-043
[ -e "$ACC" ] && { echo "$ACC exists: the acceptance home is installed once"; exit 2; }
mkdir -p "$R/.config" "$R/.local/share" "$R/.local/state" "$R/.cache" "$ACC"
mkdir -m 700 "$R/.config/claude-secrets"
cd "$G"
WANT=$(node -e 'console.log(require(process.argv[1]).assets.x64.sha256)' "$G/runtime/engine/linux-engine.json")
echo "== head $(git rev-parse HEAD), $(date -u +%FT%TZ), $(uname -m), node $(node --version); pin x64 $WANT"
env -u CUA_LINUX_ENGINE_BIN -u CUA_NATIVE_ENGINE HOME="$R" XDG_CONFIG_HOME="$R/.config" XDG_DATA_HOME="$R/.local/share" \
  XDG_STATE_HOME="$R/.local/state" XDG_CACHE_HOME="$R/.cache" CUA_HOME="$ACC" node bin/cua.mjs install --engine
E=$ACC/engine/linux/cua-engine
echo "--- engine"
ls -la "$E"
got=$(sha256sum "$E" | cut -d' ' -f1)
echo "sha256 $got"
if [ "$got" = "$WANT" ]; then echo "sha256 equals the pin"; else echo "sha256 DIFFERS from the pin $WANT"; exit 1; fi
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
