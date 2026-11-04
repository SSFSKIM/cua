#!/bin/bash
# Task 56 fix 3's bound, measured at twice the load with no proxy, every paste waiting up to 1000 ms for its target's
# TARGETS (--targets-wait-ms 1000, measurement only): gnome-terminal's key-then-paste, 200 runs; then 30 pastes each
# into gedit and Writer (GTK 3), every family's window open. Musl build of 69e3724b.
set -u
t=/Users/new/.local/share/cua-171/task56-fix3
c=69e3724be5bef4e63242e1601fede784b9d45432
h=$t/live/$c
b=/Users/new/.local/share/cua-171/task56/build/$c/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
cd "$t" || exit 2
timeout 5400 node probe.mjs "$h" "$b" "$t/runs/bound-terminal-load2" --direct --runs 200 --engine-arg --targets-wait-ms --engine-arg 1000 > "$t/runs/bound-terminal-load2.log" 2>&1
echo "terminal exit $?"
timeout 1800 node targets-matrix.mjs "$h" "$b" "$t/runs/bound-gtk3-load2" 30 1000 --load --targets gedit,writer > "$t/runs/bound-gtk3-load2.log" 2>&1
echo "gtk3 exit $? (load ended $(date +%T))"
