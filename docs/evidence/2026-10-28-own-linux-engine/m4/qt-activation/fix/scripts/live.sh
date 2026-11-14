#!/bin/bash
# The engine's live tests on a private Xvfb with a session bus, as the CI gate runs them (never :0).
# usage: live.sh <out file> [cargo test args...]   (CUA_ENGINE_BIN, if set, names the engine under test; TEST_FILTER)
set -u
out=$1
shift
cd "$HOME/.local/share/cua-171/task61fix/checkout/native/linux-engine" || exit 2
timeout 2400 xvfb-run -a dbus-run-session --dbus-daemon="$PWD/tests/dbus-daemon-quiet" -- cargo test --release --features live "$@" -- --test-threads 1 ${TEST_FILTER:-} > "$out" 2>&1
code=$?
grep -E '^test |test result|panicked|left:|right:|assertion|skipped' "$out" | tail -60
echo "exit $code"
