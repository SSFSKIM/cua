#!/bin/bash
# Task 147 (from task 136's install-home.sh): the fresh acceptance home for 0.4.4, home-arm64-044. Its own
# `cua install --engine` (from the H9 checkout t147-h9) places the pinned runtime and linux-engine-v0.4.4 in CUA_HOME,
# under a HOME and XDG directories of the run's with an empty secret store. Then the engine's sha256 against H9's pin,
# its --version, `file`, the install record and the pinned rule (gate.mjs check --pinned, whose engine_tree must be
# 23f34217's). Under the host lock.
set -euo pipefail
export PATH=/Users/new/.local/share/cua-171/node24/bin:$PATH
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t147-h9
D=/Users/new/.local/share/cua-171/m5
ACC=$D/home-arm64-044
R=$D/install-home-arm64-044
[ -e "$ACC" ] && { echo "$ACC exists: the acceptance home is installed once"; exit 2; }
mkdir -p "$R/.config" "$R/.local/share" "$R/.local/state" "$R/.cache" "$ACC"
mkdir -m 700 "$R/.config/claude-secrets"
cd "$G"
WANT=$(node -e 'console.log(require(process.argv[1]).assets.arm64.sha256)' "$G/runtime/engine/linux-engine.json")
echo "== head $(git rev-parse HEAD), $(date -u +%FT%TZ), $(uname -m), node $(node --version); the pin's arm64 sha256 $WANT"
run_home() { env -u CUA_LINUX_ENGINE_BIN HOME="$R" XDG_CONFIG_HOME="$R/.config" XDG_DATA_HOME="$R/.local/share" \
  XDG_STATE_HOME="$R/.local/state" XDG_CACHE_HOME="$R/.cache" CUA_HOME="$ACC" "$@"; }
run_home env -u CUA_NATIVE_ENGINE node bin/cua.mjs install --engine
E=$ACC/engine/linux/cua-engine
echo "--- engine"
ls -la "$E"
s=$(sha256sum "$E" | cut -d' ' -f1)
echo "sha256 $s"
[ "$s" = "$WANT" ] && echo "sha256 equals H9's pin" || { echo "sha256 DIFFERS from H9's pin $WANT"; exit 3; }
"$E" --version
file "$E"
cat "$ACC/engine/linux/install.json"
echo
ls "$ACC/runtimes"
echo "--- the secret store is empty: $(ls -A "$R/.config/claude-secrets" | wc -l) entries"
set +e
echo "--- gate.mjs check --pinned"
node scripts/linux-engine-gate/gate.mjs check --pinned "$ACC"
code=$?
echo "check exit $code"
exit $code
