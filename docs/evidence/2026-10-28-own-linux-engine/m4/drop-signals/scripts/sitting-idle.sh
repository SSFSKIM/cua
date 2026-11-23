#!/bin/bash
# Task 68's idle sitting: the main plan, then the freeze sweep, then the covered paths, each its own run on its own
# private display, one after the other, on the musl build of 405aa773 and its exported harness.
set -u
d=$(dirname "$0")
H=$HOME/.local/share/cua-171/task68/harness-405aa773
E=$HOME/.local/share/cua-171/task68/build/405aa773/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
"$d/ds.sh" "$H" idle-main "$E" --plan main
"$d/ds.sh" "$H" idle-freeze "$E" --plan freeze
"$d/ds.sh" "$H" idle-cover "$E" --plan cover
