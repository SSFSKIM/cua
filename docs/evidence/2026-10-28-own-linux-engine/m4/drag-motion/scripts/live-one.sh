#!/bin/bash
# One test of the engine's live suite as the gate builds it, on a private Xvfb (xvfb-run -a), never :0.
# usage: live-one.sh <log> <test name filter>
set -u
cd $HOME/Developer/GitHub/cua/.claude/worktrees/cua-171/native/linux-engine
unset DISPLAY
xvfb-run -a dbus-run-session --dbus-daemon="$PWD/tests/dbus-daemon-quiet" -- cargo test --release --locked --target x86_64-unknown-linux-musl --features live --test live_device -- --test-threads 1 "$2" > "$1" 2>&1
echo "exit $?"
grep -E '^test |test result|panicked|assertion' -A3 "$1" | head -20
