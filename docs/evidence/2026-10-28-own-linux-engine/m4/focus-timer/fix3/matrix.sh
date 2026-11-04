#!/bin/bash
# Task 56 fix 3's matrix pass on the musl build of 69e3724b: idle, then at twice the load.
set -u
t=/Users/new/.local/share/cua-171/task56-fix3
c=69e3724be5bef4e63242e1601fede784b9d45432
h=$t/live/$c
b=/Users/new/.local/share/cua-171/task56/build/$c/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
cd "$t" || exit 2
rm -rf "$t/runs/matrix-idle"
timeout 1800 node targets-matrix.mjs "$h" "$b" "$t/runs/matrix-idle" 5 1000 > "$t/runs/matrix-idle.log" 2>&1
echo "matrix idle exit $?"
timeout 1800 node targets-matrix.mjs "$h" "$b" "$t/runs/matrix-load2" 5 1000 --load > "$t/runs/matrix-load2.log" 2>&1
echo "matrix load2 exit $? (load ended $(date +%T))"
