#!/bin/bash
# The device cases of the given scenes (`--ops all`), idle, once, on a private display: task 63's rig
# (m4/foreground-raise/scripts/private-run.mjs, the copy in the exported harness), the Mozilla Firefox deb first on
# PATH as sitting.sh puts it, on the fix wave's engine and the vendor pair task 63 used.
# usage: device.sh <harness dir> <engine> <scenes, comma-separated> <name>
set -u
harness=$1
engine=$2
scenes=$3
name=$4
SKY=$HOME/.local/share/cua/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky
NEWEST=$HOME/.local/share/cua-171/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
out=$HOME/.local/share/cua-171/task62fix/runs/$name
if pgrep -x stress-ng >/dev/null; then
  echo "stress-ng is running: not starting $name" >&2
  exit 3
fi
PATH=$HOME/.local/share/cua-171/task59/bin:$PATH node "$harness/docs/evidence/2026-10-28-own-linux-engine/m4/foreground-raise/scripts/private-run.mjs" \
  "$harness" "$out" --dev --vendor "$SKY/bin/linux/sky_linux_x64" --newest "$NEWEST" --cua "$engine" --scene "$scenes" \
  --ops all --blocks 1 --run "t62f-$name"
echo "exit $?"
tail -5 "$out/stdout.log"
