#!/bin/bash
# One live test of the engine sources exported for a commit (build-musl.sh's tree), with cargo's own live build.
# usage: live-at.sh <commit sha (the build directory's name)> <filter>
set -u
cd "$HOME/.local/share/cua-171/task63/build/$1/src/native/linux-engine" || exit 2
xvfb-run -a dbus-run-session --dbus-daemon="$PWD/tests/dbus-daemon-quiet" -- cargo test --features live --test live_device -- --test-threads 1 "$2"
