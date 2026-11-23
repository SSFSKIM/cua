#!/bin/bash
# task 121: a drop-signals development run on Chrome, on a private display, against the pinned 0.4.2 engine installed
# in the run-owned home. Usage: sweep.sh <name> <plan> [extra harness args...]
set -u
repo=/Users/new/Developer/GitHub/cua/.claude/worktrees/agent-a4d8cf4660dd54f80
T=/Users/new/.local/share/cua-171/task121
name=$1; plan=$2; shift 2
engine=$T/home/.local/share/cua/engine/linux/cua-engine
cd "$repo"
node "$T/scripts/private-run.mjs" "$repo" "$T/runs/$name" "development run, not a release gate (task 121, $name)" -- \
  --experiment drop-signals --family chrome --plan "$plan" --cua "$engine" --run "t121-$name" "$@"
