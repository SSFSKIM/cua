#!/bin/bash
# The drag-and-drop device cases (scene device-chrome-dnd, the late-take case `chrome_dnd_late_take_shared` among them)
# on a build, cua alone judged by each case's expectation, idle, on a private Xvfb with Openbox (task 60's
# priv-run.mjs), --dev. The vendor builds are named because a verdict run requires them; device cases run cua alone.
# usage: device-dnd.sh <harness dir> <engine> <name> [ops]
set -u
harness=$1
bin=$2
name=$3
ops=${4:-all}
VENDOR=$HOME/.local/share/cua/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
NEWEST=$HOME/.local/share/cua-171/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
out=$HOME/.local/share/cua-171/task60-fix/runs/$name
if pgrep -x stress-ng >/dev/null; then
  echo "stress-ng is running: not starting $name" >&2
  exit 3
fi
mkdir -p "$out"
timeout 7200 node "$HOME/.local/share/cua-171/task60/scripts/priv-run.mjs" "$harness" "$out" -- --dev --vendor "$VENDOR" --newest "$NEWEST" --cua "$bin" \
  --scene device-chrome-dnd --ops "$ops" --blocks 3 --run "t60fix-$name" --out "$out/run" > "$out/run.log" 2>&1
echo "device $name exit $? $(date -u +%T)"
tail -40 "$out/run.log"
