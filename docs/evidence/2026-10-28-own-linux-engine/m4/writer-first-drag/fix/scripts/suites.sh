#!/bin/bash
# task 72 fix wave: the suites on the final sources (under the host lock): the engine's fmt check and its unit and live
# suites with the gate's flags (ci-kit.yml engine-linux) on a display xvfb-run picks, cua's service tests, and the
# harness suite through its cleanup check
# usage: suites.sh <out dir>
set -u
out=$1
mkdir -p "$out"
W=$HOME/Developer/GitHub/cua/.claude/worktrees/<task72fix-worktree>
cd "$W/native/linux-engine"
cargo fmt --check > "$out/fmt.txt" 2>&1
f=$?
xvfb-run -a dbus-run-session --dbus-daemon="$PWD/tests/dbus-daemon-quiet" -- cargo test --release --locked --target x86_64-unknown-linux-musl --features live -- --test-threads 1 > "$out/engine.txt" 2>&1
e=$?
cd "$W"
node --test test/services-engine-linux/*.test.mjs > "$out/services.txt" 2>&1
s=$?
npm run test:linux-engine-diff > "$out/harness.txt" 2>&1
h=$?
echo "fmt $f engine $e services $s harness $h" | tee "$out/status.txt"
[ "$f" = 0 ] && [ "$e" = 0 ] && [ "$s" = 0 ] && [ "$h" = 0 ]
