#!/bin/bash
# Task 54, run 1: device-gtk4 alone on :0 (a development run, not a release gate), the live proof of task 53's judge
# rules (task 53's report, "What the live proof must run and check", step 4), with task 50's engines, guarded by
# run50.sh. No whole-run RECORD: the harness refuses it on a display without the private mark.
set -u
here=$(cd "$(dirname "$0")" && pwd)
SKY=/Users/new/.local/share/cua/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky
NEWEST=/Users/new/.local/share/cua-171/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
CUA=/Users/new/.local/share/cua-171/task42/engine/cua-engine
exec "$here/run50.sh" "${1:?out}" --dev --vendor "$SKY/bin/linux/sky_linux_x64" --newest "$NEWEST" --cua "$CUA" \
  --scene device-gtk4 --ops all --blocks 3 --run "${2:-task54-device-gtk4}"
