#!/bin/bash
# The engine's live tests under xvfb-run and a private session bus, as the CI gate runs them.
# usage: live.sh <test target: live_device|all> [engine binary or -] [filter...]
set -u
cd $HOME/Developer/GitHub/cua/.claude/worktrees/cua-171/native/linux-engine || exit 2
target=$1
engine=${2:--}
shift 2 || shift $#
if [ "$engine" != "-" ]; then export CUA_ENGINE_BIN=$engine; fi
if [ "$target" = all ]; then sel=(); else sel=(--test "$target"); fi
xvfb-run -a dbus-run-session --dbus-daemon="$PWD/tests/dbus-daemon-quiet" -- cargo test --release --locked --target x86_64-unknown-linux-musl --features live "${sel[@]}" -- --test-threads 1 "$@"
