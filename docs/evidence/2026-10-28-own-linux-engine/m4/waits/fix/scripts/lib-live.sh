#!/bin/bash
# The engine's library tests (unit tests, live ones included) under xvfb-run and a private session bus, with the gate's
# flags, from a source tree (default: the shared checkout's engine).
# usage: lib-live.sh [engine source dir|-] [filter...]
set -u
src=${1:--}
shift || true
[ "$src" = "-" ] && src=$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171/native/linux-engine
cd "$src" || exit 2
xvfb-run -a dbus-run-session --dbus-daemon="$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171/native/linux-engine/tests/dbus-daemon-quiet" -- cargo test --release --locked --target x86_64-unknown-linux-musl --features live --bin cua-engine -- --test-threads 1 "$@"
