#!/bin/bash
# Task 73's engine checks with the gate's flags (run under the host lock): cargo fmt --check, clippy with and without
# `live`, the whole unit suite and the whole live suite (engine-tests.sh), each log under $T/suites/<label>-*.log; then
# one line per step with its status.
# usage: engine-suites.sh <label>
set -u
d=$(cd "$(dirname "$0")" && pwd)
. "$d/env.sh"
label=$1
mkdir -p "$T/suites"
cd "$WT/native/linux-engine"
flags=(--release --locked --target x86_64-unknown-linux-musl)
step() {
  local name=$1
  shift
  "$@" > "$T/suites/$label-$name.log" 2>&1
  echo "$name status $?"
}
step fmt cargo fmt --check
step clippy cargo clippy "${flags[@]}" --all-targets -- -D warnings
step clippy-live cargo clippy "${flags[@]}" --all-targets --features live -- -D warnings
step unit "$d/engine-tests.sh" unit
step live "$d/engine-tests.sh" live -- --test-threads 1
grep -h 'test result' "$T/suites/$label-unit.log" "$T/suites/$label-live.log"
