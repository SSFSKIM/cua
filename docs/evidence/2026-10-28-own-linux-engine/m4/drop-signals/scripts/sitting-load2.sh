#!/bin/bash
# Task 68's sitting at twice the load: the main plan with 16 stress-ng workers on the VM's 8 cores (--load-factor 2,
# started and stopped by the harness), then the freeze sweep at the same load.
set -u
d=$(dirname "$0")
H=$HOME/.local/share/cua-171/task68/harness-405aa773
E=$HOME/.local/share/cua-171/task68/build/405aa773/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
"$d/ds.sh" "$H" load2-main "$E" --plan main --load-factor 2
"$d/ds.sh" "$H" load2-freeze "$E" --plan freeze --load-factor 2
