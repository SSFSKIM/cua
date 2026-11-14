#!/bin/bash
# RED for a live test: the working tree's live tests (tests/live_device.rs, tests/support/) run against a commit's
# engine sources, as the engine-linux gate runs them, on a private Xvfb (xvfb-run -a), never :0.
# usage: live-red.sh <commit> <log> <test name filter>
set -u
if [ -e "$HOME/.local/share/cua-171/hold-sittings" ]; then echo "hold-sittings present" >&2; exit 5; fi
wt=$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171
dir=$HOME/.local/share/cua-171/task66-fix/red-$1
rm -rf "$dir"
mkdir -p "$dir"
git -C "$wt" archive "$1" native/linux-engine | tar -x -C "$dir"
cp "$wt/native/linux-engine/tests/live_device.rs" "$dir/native/linux-engine/tests/live_device.rs"
cp "$wt/native/linux-engine/tests/support/mod.rs" "$dir/native/linux-engine/tests/support/mod.rs"
cd "$dir/native/linux-engine"
unset DISPLAY
xvfb-run -a dbus-run-session --dbus-daemon="$PWD/tests/dbus-daemon-quiet" -- cargo test --release --locked --target x86_64-unknown-linux-musl --features live --test live_device -- --test-threads 1 "$3" > "$2" 2>&1
echo "exit $?"
grep -E '^test |test result|panicked|assertion|left|right' -A2 "$2" | head -30
