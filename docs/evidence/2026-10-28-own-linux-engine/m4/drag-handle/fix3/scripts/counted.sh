#!/bin/bash
# Task 73's third fix wave: the counted sittings on 83dd7e5b's release build, one locked call each (about 20 min each):
# t17-fix3 idle, at the gate's window load, at twice the load.
w=$HOME/.local/share/cua-171/task73fix3
h=$w/harness-83dd7e5b
e=$w/build/83dd7e5bfedbc0030d8f59f0b05df25066f2fb71/src/native/linux-engine/target/x86_64-unknown-linux-musl/release/cua-engine
for line in "idle3 t17-fix3 new idle" "gate3 t17-fix3 new gate" "load3 t17-fix3 new load2"; do
  echo "$line" | $HOME/.local/share/cua-171/locked.sh task73fix3 bash "$w/scripts/batch.sh" "$h" "$e"
done
