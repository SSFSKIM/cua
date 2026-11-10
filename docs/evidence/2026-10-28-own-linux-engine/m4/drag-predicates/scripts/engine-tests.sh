#!/bin/bash
# The engine's tests as the engine-linux gate runs them (--release --locked --target x86_64-unknown-linux-musl, the
# live ones under xvfb-run and dbus-run-session), from this checkout's native/linux-engine or $ENGINE_DIR.
# usage: engine-tests.sh unit|live [cargo test filters and arguments...]
set -u
d=$(cd "$(dirname "$0")" && pwd)
. "$d/env.sh"
cd "${ENGINE_DIR:-$WT/native/linux-engine}"
what=$1
shift
flags=(--release --locked --target x86_64-unknown-linux-musl)
case "$what" in
  unit) exec cargo test "${flags[@]}" "$@" ;;
  live) exec xvfb-run -a dbus-run-session --dbus-daemon="$PWD/tests/dbus-daemon-quiet" -- cargo test "${flags[@]}" --features live "$@" ;;
  *) echo "unit or live" >&2; exit 2 ;;
esac
