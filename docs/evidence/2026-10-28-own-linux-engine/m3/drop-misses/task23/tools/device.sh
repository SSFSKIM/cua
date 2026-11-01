#!/bin/bash
# device.sh <name> [blocks]: the differential harness's Chrome device scenes (device-chrome, device-chrome-dnd, every
# case) with task 23's engine and harness, on a private display (private.sh). Output under runs/<name>/.
set -u
T=/Users/new/.local/share/cua-171/task23
name=$1
SKY="$HOME/.local/share/cua/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky"
VENDOR="$SKY/bin/linux/sky_linux_x64"
NEWEST="$HOME/.local/share/cua-171/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64"
OUT=$T/runs/$name
rm -rf "$OUT"
mkdir -p "$OUT"
"$T/private.sh" "$OUT/run.log" node scripts/linux-engine-diff.mjs --vendor "$VENDOR" --newest "$NEWEST" --cua "${CUA_BIN:-$T/engine/cua-engine}" \
  --scene "${SCENES:-device-chrome,device-chrome-dnd}" --ops all --blocks "${2:-2}" --out "$OUT/diff" --run "$name"
