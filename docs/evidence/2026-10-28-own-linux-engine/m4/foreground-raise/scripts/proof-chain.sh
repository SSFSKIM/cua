#!/bin/bash
# Task 63's sittings, one after another (never two loads at once), each traced by xprobe order-watch.
set -u
t=$HOME/.local/share/cua-171/task63
H=$t/harness-89e64080
OLD=$t/build/4996fd29d8ade71f9038d8cf3456e1d53cdcdc14/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
NEW=$t/build/4dc625da00f66c683e4c57b2702428e7f943a64e/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
OTHERS=firefox,chrome,electron,qt5,qt6
run() { echo "== $1 $(date -u +%T)"; "$t/scripts/traced-sitting.sh" "$H" "${@:2}" 2>&1 | tail -14; }
run fix-gtk4-load2 "$NEW" fix-gtk4-load2 --family gtk4 --routes dedicated --lanes shipped --load-factor 2
run fix-gtk4-idle "$NEW" fix-gtk4-idle --family gtk4 --routes dedicated --lanes shipped
run base-others-load2 "$OLD" base-others-load2 --family $OTHERS --routes dedicated --lanes shipped --load-factor 2
run fix-others-load2 "$NEW" fix-others-load2 --family $OTHERS --routes dedicated --lanes shipped --load-factor 2
run fix-others-idle "$NEW" fix-others-idle --family $OTHERS --routes dedicated --lanes shipped
echo "== done $(date -u +%T)"
