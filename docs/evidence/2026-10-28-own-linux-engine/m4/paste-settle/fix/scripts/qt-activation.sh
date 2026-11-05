#!/bin/bash
# Whether a background click to kate, at twice the load, leaves the front window active: the engines before task 60,
# task 60's and the fix's, click-then-paste on the engine as each ships, 10 runs each.
set -u
D=$HOME/.local/share/cua-171/task60-fix/scripts
OLD=$HOME/.local/share/cua-171/task59/build/40b1e16329d69e4bf267acddf5c53364365c4d33/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
T60=$HOME/.local/share/cua-171/task60/build/5570d064e6f6e5757a0072adb880ed7aea603c01/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
for spec in before-t60=$OLD t60=$T60; do
  label=${spec%%=*}
  "$D/sitting.sh" "$HOME/.local/share/cua-171/task60-fix/harness-${HARNESS:?}" "${spec#*=}" "qt-activation-$label" --scenarios click-paste --lanes shipped --family kate --trials 10 --load-factor 2 > /dev/null
  echo "$label"; python3 "$D/front-active.py" "$HOME/.local/share/cua-171/task60-fix/runs/qt-activation-$label/results.jsonl"
done
