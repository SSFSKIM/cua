#!/bin/bash
# The engine's unit and live suites as the engine-linux gate runs them (.github/ci-kit.yml), on a private Xvfb.
set -u
cd "$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171/native/linux-engine"
xvfb-run -a dbus-run-session --dbus-daemon="$PWD/tests/dbus-daemon-quiet" -- cargo test --release --locked --target x86_64-unknown-linux-musl --features live -- --test-threads 1
echo "rc=$?"
