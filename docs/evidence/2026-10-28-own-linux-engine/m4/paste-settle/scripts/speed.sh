#!/bin/bash
# Task 56 fix 3's paste speed series again, on task 60's build: the differential run's text scenes gedit (GTK 3),
# chrome-textarea (Chromium) and gnome-text-editor (GTK 4, dedicated, the foreground route), against the pinned and
# newest vendor builds, idle, on a private Xvfb with Openbox (priv-run.mjs), --dev.
# usage: speed.sh <harness dir> <engine> <name>
set -u
harness=$1
bin=$2
name=$3
VENDOR=$HOME/.local/share/cua/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
NEWEST=$HOME/.local/share/cua-171/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
out=$HOME/.local/share/cua-171/task60/runs/$name
if pgrep -x stress-ng >/dev/null; then
  echo "stress-ng is running: not starting $name" >&2
  exit 3
fi
mkdir -p "$out"
timeout 7200 node "$HOME/.local/share/cua-171/task60/scripts/priv-run.mjs" "$harness" "$out" -- --dev --vendor "$VENDOR" --newest "$NEWEST" --cua "$bin" \
  --scene gedit,chrome-textarea,gnome-text-editor --ops type_text,type_text_selection,clipboard_write \
  --run "t60-$name" --out "$out/run" > "$out/run.log" 2>&1
echo "speed $name exit $? $(date -u +%T)"
tail -30 "$out/run.log"
