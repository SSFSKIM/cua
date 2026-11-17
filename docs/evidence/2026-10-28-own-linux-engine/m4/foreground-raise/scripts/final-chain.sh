#!/bin/bash
# Task 63's sittings on the final engine (c87e5584) and harness (3e9619a8), with the base engine's Qt cells, one after another, each traced by xprobe order-watch; then the
# device-mode cases (Acceptance 8's, the witness and the audit) on a private display.
set -u
t=$HOME/.local/share/cua-171/task63
H=$t/harness-3e9619a8
NEW=$t/build/c87e55849f41d5b6cd9f5ab12092c043e6511b88/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
OTHERS=firefox,chrome,electron,qt5,qt6
run() { echo "== $1 $(date -u +%T)"; "$t/scripts/traced-sitting.sh" "$H" "${@:2}" 2>&1 | tail -14; }
run final-gtk4-load2 "$NEW" final-gtk4-load2 --family gtk4 --routes dedicated --lanes shipped --load-factor 2
run final-gtk4-idle "$NEW" final-gtk4-idle --family gtk4 --routes dedicated --lanes shipped
run final-others-load2 "$NEW" final-others-load2 --family $OTHERS --routes dedicated --lanes shipped --load-factor 2
OLD=$t/build/4996fd29d8ade71f9038d8cf3456e1d53cdcdc14/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
run base-qt-load2 "$OLD" base-qt-load2 --family qt5,qt6 --routes dedicated --lanes shipped --load-factor 2
run final-others-idle "$NEW" final-others-idle --family $OTHERS --routes dedicated --lanes shipped
echo "== final-device $(date -u +%T)"
SKY=$HOME/.local/share/cua/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky
NEWEST=$HOME/.local/share/cua-171/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
if pgrep -x stress-ng >/dev/null; then echo "stress-ng is running: not starting the device run"; exit 3; fi
PATH=$HOME/.local/share/cua-171/task59/bin:$PATH node "$t/scripts/private-run.mjs" "$H" "$t/runs/final-device" \
  --dev --vendor "$SKY/bin/linux/sky_linux_x64" --newest "$NEWEST" --cua "$NEW" \
  --scene device-gtk4,device-firefox,device-qt,device-chrome,device-chrome-dnd,device-xterm --ops all --blocks 3 --run t63-final-device
echo "== done $(date -u +%T)"
