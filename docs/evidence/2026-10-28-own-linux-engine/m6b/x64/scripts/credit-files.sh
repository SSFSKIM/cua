#!/bin/bash
# Each file of the da7585c31..854103aa5 stat with the commits that touched it (for the bridge table's assignment).
set -u
T=/Users/new/.local/share/cua-171/t173
cd "$(cd "$T/wt" && pwd -P)" || exit 2
PATHS=(src/services/engine/linux src/services/engine/policy.mjs src/services/sky.mjs src/cua-api src/repl-host docs/cua-api native/linux-engine)
for f in $(git diff --name-only da7585c31 854103aa5 -- "${PATHS[@]}"); do
  echo "$f: $(git log --format=%h da7585c31..854103aa5 -- "$f" | tr '\n' ' ')"
done
