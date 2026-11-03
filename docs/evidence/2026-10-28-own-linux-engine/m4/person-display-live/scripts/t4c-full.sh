#!/bin/bash
# Task 50, step 4: T4c's full manifest on :0 (a development run, not a release gate), the run task 40 began under the
# whole-run record and the design session ruled again after :0's recovery, now with no record (the harness refuses it
# on a display without the private mark): M3's gate scenes (m3-gate-musl's list and flags), then M4's in the spec's
# frozen order (the identity scenes after device-chrome-dnd, then the minimized ones), every lane, --ops all, three
# blocks, on task 42's musl build of the engine (unchanged since 7ad6f03d), started with the owner's Chrome active.
# The harness's own connections are judged whole-run through its xtrace trace, the engines through the sampled route
# audits, T4b's identity check before each act. Guarded by run50.sh.
set -u
here=$(cd "$(dirname "$0")" && pwd)
SKY=/Users/new/.local/share/cua/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky
NEWEST=/Users/new/.local/share/cua-171/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
CUA=/Users/new/.local/share/cua-171/task42/engine/cua-engine
M3=desktop,gedit,chrome,chrome-input,over-budget,retention,chrome-textarea,chrome-address-bar,gnome-text-editor,paste-target,device-gtk4,device-firefox,device-xterm,device-qt,device-chrome,device-chrome-dnd
M4=identity,identity-gtk3,identity-gtk4,identity-kate,minimized,minimized-xterm,minimized-recorder
exec "$here/run50.sh" "${1:?out}" --dev --vendor "$SKY/bin/linux/sky_linux_x64" --newest "$NEWEST" --cua "$CUA" \
  --scene "$M3,$M4" --ops all --blocks 3 --run "${2:-task50-t4c-full}"
