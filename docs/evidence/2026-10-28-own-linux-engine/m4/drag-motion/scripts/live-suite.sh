#!/bin/bash
# The engine's live suite as the engine-linux gate runs it, on a private Xvfb (xvfb-run -a), never :0.
# usage: live-suite.sh <log>
set -u
if [ -e "$HOME/.local/share/cua-171/hold-sittings" ]; then echo "hold-sittings present" >&2; exit 5; fi
cd $HOME/Developer/GitHub/cua/.claude/worktrees/cua-171/native/linux-engine
unset DISPLAY
xvfb-run -a dbus-run-session --dbus-daemon="$PWD/tests/dbus-daemon-quiet" -- cargo test --release --locked --target x86_64-unknown-linux-musl --features live -- --test-threads 1 > "$1" 2>&1
echo "live suite exit $?"
grep -E '^test result|FAILED|panicked' "$1" | head -20
