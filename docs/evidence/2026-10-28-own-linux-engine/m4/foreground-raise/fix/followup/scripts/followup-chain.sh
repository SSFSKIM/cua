#!/bin/bash
# Task 63's follow-up: the activate-then-click cell at twice the load on the follow-up engine (5138f698), then the
# device-mode cases with the minimized scenes at twice the load: the harness's own load (16 stress-ng CPU workers on 8
# cores, matrixprod, as experiments.mjs startLoad runs it) started here for the device run's length, since the
# differential run takes no --load. Refuses to start a load while another stress-ng runs.
set -u
t=$HOME/.local/share/cua-171/task63
H=$t/harness-f0b96f1c
NEW=$t/build/5138f698*/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
NEW=$(ls $NEW)
echo "== engine $("$NEW" --version)"
echo "== fu-cell-load2 $(date -u +%T)"
"$t/scripts/traced-sitting.sh" "$H" "$NEW" fu-cell-load2 --family gtk3 --kinds activate_click --lanes settle-0,shipped --load-factor 2 > "$t/runs/fu-cell-load2.chain.txt" 2>&1
echo "   exit $? $(grep -o '"kind":"settle-verdict","pass":[a-z]*' "$t/runs/fu-cell-load2/results.jsonl")"
echo "== fu-device-load2 $(date -u +%T)"
if pgrep -x stress-ng >/dev/null; then echo "stress-ng is running: not starting the device run"; exit 3; fi
setsid stress-ng --cpu $(( $(nproc) * 2 )) --cpu-method matrixprod --timeout 3h --quiet &
load=$!
sleep 5
echo "   load: $(cut -d' ' -f1-3 /proc/loadavg)"
SKY=$HOME/.local/share/cua/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky
NEWEST=$HOME/.local/share/cua-171/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
PATH=$HOME/.local/share/cua-171/task59/bin:$PATH node "$t/scripts/private-run.mjs" "$H" "$t/runs/fu-device-load2" \
  --dev --vendor "$SKY/bin/linux/sky_linux_x64" --newest "$NEWEST" --cua "$NEW" \
  --scene device-gtk4,device-firefox,device-qt,device-chrome,device-chrome-dnd,device-xterm,minimized,minimized-xterm,minimized-recorder \
  --ops all --blocks 3 --run t63-fu-device-load2
code=$?
echo "   load at the end: $(cut -d' ' -f1-3 /proc/loadavg)"
kill -TERM -- -$load 2>/dev/null || kill -TERM $load
wait $load 2>/dev/null
echo "   device exit $code; stress-ng left: $(pgrep -cx stress-ng)"
echo "== done $(date -u +%T)"
