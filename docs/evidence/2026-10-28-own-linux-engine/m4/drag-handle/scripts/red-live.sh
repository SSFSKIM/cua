#!/bin/bash
# Task 73: the live device tests of this checkout run against an older commit's engine, to show they fail there (RED):
# the commit's native/linux-engine exported apart, this checkout's tests/live_device.rs copied in, then the named tests
# with the gate's flags under xvfb. Run it under the host lock.
# usage: red-live.sh <commit> <test name filter>...
set -u
d=$(cd "$(dirname "$0")" && pwd)
. "$d/env.sh"
commit=$1
shift
root=$T/red/$commit
rm -rf "$root"
mkdir -p "$root"
git -C "$WT" archive "$commit" native/linux-engine | tar -x -C "$root"
e=$root/native/linux-engine
cp "$WT/native/linux-engine/tests/live_device.rs" "$e/tests/live_device.rs"
cd "$e"
xvfb-run -a dbus-run-session --dbus-daemon="$PWD/tests/dbus-daemon-quiet" -- cargo test --release --locked \
  --target x86_64-unknown-linux-musl --features live --test live_device -- --test-threads 1 "$@"
