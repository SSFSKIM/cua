#!/bin/bash
# On the fix's build: the drag-and-drop device cases (the late-take case among them), then click-then-paste and
# click-field on the engine as it ships (lane `shipped`), idle and at twice the load.
set -u
D=$HOME/.local/share/cua-171/task60-fix/scripts
H=$HOME/.local/share/cua-171/task60-fix/harness-397b2191
E=$HOME/.local/share/cua-171/task60-fix/build/397b21913d201d15bb084c09ec9c69dd75d9469b/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
"$D/device-dnd.sh" "$H" "$E" device-dnd | grep -E 'exit|VERDICT|late_take|FAIL' | head -20
"$D/sitting.sh" "$H" "$E" shipped-clicks-idle --scenarios click-paste,click-field --lanes shipped | grep -E '^sitting|not reached|not clean|Incomplete' | head
"$D/sitting.sh" "$H" "$E" shipped-clicks-load2 --scenarios click-paste,click-field --lanes shipped --load-factor 2 | grep -E '^sitting|not reached|not clean|Incomplete' | head
