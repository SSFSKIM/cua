#!/bin/bash
# Task 98: the engine's tests from a checkout, under the host lock, on a private Xvfb with its own session bus (never
# :0), as the engine-linux gate runs them: the release profile, which aborts on a panic (one live test needs it).
# usage: engine-test.sh <checkout> unit|live [cargo test filters...]
set -u
D=/Users/new/.local/share/cua-171
G=$1; KIND=$2; shift 2
[ -e "$D/hold-sittings" ] && { echo "hold-sittings present: nothing starts"; exit 5; }
cd "$G/native/linux-engine" || exit 2
unset DISPLAY XAUTHORITY
if [ "$KIND" = live ]; then
  exec "$D/locked.sh" m5-l4a timeout -s TERM -k 120 40m xvfb-run -a dbus-run-session --dbus-daemon="$G/native/linux-engine/tests/dbus-daemon-quiet" -- \
    "$D/bin/cargo" test --release --locked --features live -- --test-threads 1 "$@"
fi
exec "$D/locked.sh" m5-l4a timeout -s TERM -k 120 40m "$D/bin/cargo" test "$@"
