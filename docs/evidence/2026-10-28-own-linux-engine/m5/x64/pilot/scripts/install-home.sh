#!/bin/bash
# task 87: the x64 pilot's run home. Its own `cua install` (from the pilot checkout at 01ff0648) places the pinned
# runtime and linux-engine-v0.4.0 in CUA_HOME, under a HOME and XDG directories of the run's with an empty secret store,
# as suites.sh's run_home does. Then the engine's hash against the pin, its --version, `file`, and the install record.
set -euo pipefail
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t87-pilot
P=/Users/new/.local/share/cua-171/m5/pilot-x64
ACC=$P/home
R=$P/install-home
[ -e "$ACC" ] && { echo "$ACC exists: a pilot home is installed once"; exit 2; }
mkdir -p "$R/.config" "$R/.local/share" "$R/.local/state" "$R/.cache" "$ACC"
mkdir -m 700 "$R/.config/claude-secrets"
cd "$G"
env -u CUA_LINUX_ENGINE_BIN -u CUA_NATIVE_ENGINE HOME="$R" XDG_CONFIG_HOME="$R/.config" XDG_DATA_HOME="$R/.local/share" \
  XDG_STATE_HOME="$R/.local/state" XDG_CACHE_HOME="$R/.cache" CUA_HOME="$ACC" node bin/cua.mjs install
E=$ACC/engine/linux/cua-engine
echo "--- engine"
ls -la "$E"
sha256sum "$E"
node -e 'const p=require(process.argv[1]);console.log("pin x64", JSON.stringify(p.assets?.x64 ?? p.assets ?? p))' "$G/runtime/engine/linux-engine.json"
"$E" --version
file "$E"
cat "$ACC/engine/linux/install.json"
echo
ls "$ACC/runtimes"
