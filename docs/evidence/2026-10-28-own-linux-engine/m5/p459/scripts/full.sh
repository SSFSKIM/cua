#!/bin/bash
# Task 126: the focused tests, then the engine's whole suite as the engine-linux gate runs it (release, musl, the live
# feature, Xvfb with a session bus, GTK tests required), clippy and fmt, under one hold of the host lock.
# usage: full.sh <log dir>
set -u
E=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/m5-p459/native/linux-engine
L=$1
mkdir -p "$L"
cd "$E" || exit 2
export CARGO_TARGET_DIR=/Users/new/.local/share/cua-171/task126/target
export PATH=/Users/new/.cargo/bin:$PATH
export CUA171_GTK_TESTS=required
cargo fmt --check > "$L/fmt.txt" 2>&1; echo "fmt exit $?" >> "$L/fmt.txt"
cargo test --locked --bin cua-engine release_sync > "$L/unit.txt" 2>&1; echo "unit exit $?" >> "$L/unit.txt"
xvfb-run -a dbus-run-session --dbus-daemon="$PWD/tests/dbus-daemon-quiet" -- \
  cargo test --locked --features live --test live_device -- --test-threads 1 the_keepalive_form the_ping_form a_chromium_handle_s_end_gets_the_release_sync_step \
  > "$L/focused-live.txt" 2>&1; echo "focused exit $?" >> "$L/focused-live.txt"
cargo clippy --locked --all-targets --features live -- -D warnings > "$L/clippy.txt" 2>&1; echo "clippy exit $?" >> "$L/clippy.txt"
if [ "${FULL:-1}" = 1 ]; then
  xvfb-run -a dbus-run-session --dbus-daemon="$PWD/tests/dbus-daemon-quiet" -- \
    cargo test --release --locked --target x86_64-unknown-linux-musl --features live -- --test-threads 1 > "$L/suite.txt" 2>&1
  echo "suite exit $?" >> "$L/suite.txt"
fi
for f in "$L"/*.txt; do echo "== $f"; tail -n 2 "$f"; done
