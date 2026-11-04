#!/bin/bash
# The supervisor-kill probe on fix 2's head (d80f5719, exported whole): the control for the held case.
d=<probes>
B=$d/build/d4f1faee820fed776fa160f54fc864519663702c/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
for mode in held unheld; do
  bash $d/probe-supervisor-kill.sh fix2-$mode-scoped "$d/tree-d80f5719" "$B" $mode | grep -E 'summary|before the kill|keys after|stopped after|left after'
done
