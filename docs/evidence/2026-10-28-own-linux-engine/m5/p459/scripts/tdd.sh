#!/bin/bash
# Task 126: the engine's focused tests under one hold of the host lock (holder task126). With `red`, first the live
# tests against a build whose two call sites of the step are disabled (the flag parsed, the step never run), to show
# them failing for the reason the step exists; then the sources restored and the tests run as they are (green).
# usage: tdd.sh red|green <log dir>
set -u
E=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/m5-p459/native/linux-engine
L=$2
mkdir -p "$L"
cd "$E" || exit 2
export CARGO_TARGET_DIR=/Users/new/.local/share/cua-171/task126/target
export PATH=/Users/new/.cargo/bin:$PATH
TESTS="the_keepalive_form the_ping_form a_chromium_handle_s_end_gets_the_release_sync_step"
live() {
  xvfb-run -a dbus-run-session --dbus-daemon="$PWD/tests/dbus-daemon-quiet" -- \
    cargo test --locked --features live --test live_device -- --test-threads 1 $TESTS
}
if [ "$1" = red ]; then
  cp src/engine/pointer.rs "$L/pointer.rs.keep"; cp src/engine/handle.rs "$L/handle.rs.keep"
  sed -i 's|            sync.run(x, route, before_last, last)?;|            let _ = (sync, before_last, last); // RED: the step disabled|' src/engine/pointer.rs
  sed -i 's|                Some(self.sync_handle_release(form, target))|                { let _ = (form, target); None::<crate::release_sync::Synced> } // RED: the step disabled|' src/engine/handle.rs
  live > "$L/red-live.txt" 2>&1; echo "red exit $?" >> "$L/red-live.txt"
  cp "$L/pointer.rs.keep" src/engine/pointer.rs; cp "$L/handle.rs.keep" src/engine/handle.rs
fi
cargo test --locked --bin cua-engine release_sync > "$L/green-unit.txt" 2>&1; echo "unit exit $?" >> "$L/green-unit.txt"
live > "$L/green-live.txt" 2>&1; echo "green exit $?" >> "$L/green-live.txt"
for f in "$L"/*.txt; do tail -n 3 "$f"; done
