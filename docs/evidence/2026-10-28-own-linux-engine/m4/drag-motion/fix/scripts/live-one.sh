#!/bin/bash
# One live test (or a filter) of the working tree, as the engine-linux gate runs the suite, on a private Xvfb, never :0.
# usage: live-one.sh <log> <test name filter>
set -u
if [ -e "$HOME/.local/share/cua-171/hold-sittings" ]; then echo "hold-sittings present" >&2; exit 5; fi
cd $HOME/Developer/GitHub/cua/.claude/worktrees/cua-171/native/linux-engine
unset DISPLAY
xvfb-run -a dbus-run-session --dbus-daemon="$PWD/tests/dbus-daemon-quiet" -- cargo test --release --locked --target x86_64-unknown-linux-musl --features live --test live_device -- --test-threads 1 "$2" > "$1" 2>&1
echo "exit $?"
grep -E '^test |test result|panicked|assertion|left|right' -A2 "$1" | head -30
