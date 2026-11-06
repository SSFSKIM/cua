#!/bin/bash
# Task 63's fix wave: the activate-then-click cell on the previous engine (c87e5584) and the fix-wave engine (c5aa8ea5),
# the foreground cells again on the fix-wave engine, then the device-mode cases with the minimized scenes (which call
# activate_window) on a private display. One after another, each sitting traced by xprobe order-watch.
set -u
t=$HOME/.local/share/cua-171/task63
H=$t/harness-f0b96f1c
PREV=$t/build/c87e55849f41d5b6cd9f5ab12092c043e6511b88/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
NEW=$t/build/c5aa8ea58dd82808dcd9bee80546a01c7393a33f/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
OTHERS=firefox,chrome,electron,qt5,qt6
run() { echo "== $1 $(date -u +%T)"; "$t/scripts/traced-sitting.sh" "$H" "${@:2}" > "$t/runs/$1.chain.txt" 2>&1; echo "   exit $? $(grep -o '"kind":"settle-verdict","pass":[a-z]*' "$t/runs/$1/results.jsonl")"; }
CELL=(--family gtk3 --kinds activate_click --lanes settle-0,shipped)
run fixw-cell-before-load2 "$PREV" fixw-cell-before-load2 "${CELL[@]}" --load-factor 2
run fixw-cell-load2 "$NEW" fixw-cell-load2 "${CELL[@]}" --load-factor 2
run fixw-cell-idle "$NEW" fixw-cell-idle "${CELL[@]}"
run fixw-gtk4-load2 "$NEW" fixw-gtk4-load2 --family gtk4 --routes dedicated --lanes shipped --load-factor 2
run fixw-gtk4-idle "$NEW" fixw-gtk4-idle --family gtk4 --routes dedicated --lanes shipped
run fixw-others-load2 "$NEW" fixw-others-load2 --family $OTHERS --routes dedicated --lanes shipped --load-factor 2
run fixw-others-idle "$NEW" fixw-others-idle --family $OTHERS --routes dedicated --lanes shipped
echo "== fixw-device $(date -u +%T)"
SKY=$HOME/.local/share/cua/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky
NEWEST=$HOME/.local/share/cua-171/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
if pgrep -x stress-ng >/dev/null; then echo "stress-ng is running: not starting the device run"; exit 3; fi
PATH=$HOME/.local/share/cua-171/task59/bin:$PATH node "$t/scripts/private-run.mjs" "$H" "$t/runs/fixw-device" \
  --dev --vendor "$SKY/bin/linux/sky_linux_x64" --newest "$NEWEST" --cua "$NEW" \
  --scene device-gtk4,device-firefox,device-qt,device-chrome,device-chrome-dnd,device-xterm,minimized,minimized-xterm,minimized-recorder \
  --ops all --blocks 3 --run t63-fixw-device
echo "== done $(date -u +%T)"
