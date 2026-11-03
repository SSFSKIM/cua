#!/bin/bash
# Task 54, run 2: task 50's step 3 matrix on :0 again (the run bus, --experiment matrix) over gnome-text-editor,
# Firefox, gedit and gnome-terminal, with task 50's arguments and engines, guarded by run50.sh. It proves task 53's
# ruling 3 live: shared-mode refusals judged as refusals.
set -u
here=$(cd "$(dirname "$0")" && pwd)
SKY=/Users/new/.local/share/cua/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky
NEWEST=/Users/new/.local/share/cua-171/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
CUA=/Users/new/.local/share/cua-171/task42/engine/cua-engine
exec "$here/run50.sh" "${1:?out}" --experiment matrix --family gnome-text-editor,firefox,gedit,gnome-terminal \
  --vendor "$SKY/bin/linux/sky_linux_x64" --newest "$NEWEST" --cua "$CUA" --run "${2:-task54-run-bus}"
