#!/bin/bash
# run-c.sh <name> <blocks> <hold bound ms> [warm-first op|-] [gate (the ballast)]: the gate's own sequence for the cold short drop in front
# (device-chrome-dnd: chrome_dnd_covered_dedicated, then chrome_dnd_short_in_front_shared, each block a fresh engine per
# case) through the scratch harness on the scratch engine. Output under runs/<name>/; exit code in runs/<name>/exit.
set -u
S=/Users/new/.local/share/cua-171/task22/scratch
WT=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171
name=$1 blocks=$2 wait=$3 warm=${4:-} ballast=${5:-}
OUT=$S/runs/$name
mkdir -p "$OUT"
export DISPLAY=:0 XAUTHORITY=/Users/new/.Xauthority
export CUA_SCRATCH_DND_WAIT_MS=$wait
[ -n "$warm" ] && [ "$warm" != - ] && export SCRATCH_WARM_FIRST=$warm
[ -n "$ballast" ] && export SCRATCH_BALLAST=$ballast
SKY=/Users/new/.local/share/cua/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky
VENDOR=$SKY/bin/linux/sky_linux_x64
NEWEST=/Users/new/.local/share/cua-171/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
ENGINE=/Users/new/.local/share/cua-171/task22/engine-hold/cua-engine
cd "$WT" || exit 2
date -u +%FT%TZ > "$OUT/started"
node "$S/harness/scripts/linux-engine-diff.mjs" --vendor "$VENDOR" --newest "$NEWEST" --cua "$ENGINE" \
  --scene device-chrome-dnd --ops chrome_dnd_in_front_shared,chrome_dnd_covered_dedicated,chrome_dnd_short_in_front_shared,chrome_dnd_short_covered_dedicated \
  --blocks "$blocks" --no-audit --no-counts --run "t22-$name" --out "$OUT/diff" > "$OUT/run.log" 2>&1
code=$?
date -u +%FT%TZ > "$OUT/ended"
echo "$code" > "$OUT/exit"
echo "exit $code"
