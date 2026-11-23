#!/bin/bash
# task 121 (ruling 932): V5's canary cells as V5's x64 launch gives them (its scene, the gate's ballast, --hold-canary
# relative, engines unsandboxed as V5 runs them), a development run on a private display against the pinned 0.4.2
# engine; then the harness suite.
set -u
repo=/Users/new/Developer/GitHub/cua/.claude/worktrees/agent-a4d8cf4660dd54f80
T=/Users/new/.local/share/cua-171/task121
home=$T/home/.local/share/cua
cd "$repo"
echo "head $(git rev-parse HEAD) clean=$(git status --porcelain | wc -l)"
node "$T/scripts/private-run.mjs" "$repo" "$T/runs/v5-canary" "development run, not a release gate (task 121, V5's canary cells, ruling 932)" -- \
  --vendor "$home/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64" \
  --newest /Users/new/.local/share/cua-171/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64 \
  --cua "$home/engine/linux/cua-engine" --scene device-chrome-dnd --ops chrome_dnd_short_in_front_shared,chrome_select_nudged_shared \
  --blocks 3 --run t121-v5-canary --ballast gate --dev --hold-canary relative
echo "V5 canary cells exit $?"
"$T/suites.sh"
