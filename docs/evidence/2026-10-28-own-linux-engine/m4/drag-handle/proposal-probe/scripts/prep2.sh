#!/bin/bash
# task 73: the grab tool built, and the harness copy patched for the probe
set -euo pipefail
T=$HOME/.local/share/cua-171/task73
cd "$T/probes/xgrab" && cargo build --release --offline
node "$T/probes/patch-harness.mjs" "$(cat "$T/harness-path.txt")"
