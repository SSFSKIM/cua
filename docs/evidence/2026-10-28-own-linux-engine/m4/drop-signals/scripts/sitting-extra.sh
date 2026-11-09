#!/bin/bash
# Task 68's last idle sitting, on the harness of 638add49 (the engine still 405aa773's, whose sources 638add49 keeps):
# the late take under a text role, the managed covers, and the Electron plan, each its own run.
set -u
d=$(dirname "$0")
H=$HOME/.local/share/cua-171/task68/harness-638add49
E=$HOME/.local/share/cua-171/task68/build/405aa773/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
"$d/ds.sh" "$H" idle-extra "$E" --plan extra
"$d/ds.sh" "$H" idle-cover-managed "$E" --plan cover-managed
"$d/ds.sh" "$H" idle-electron "$E" --plan electron --family electron
