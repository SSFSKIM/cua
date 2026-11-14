#!/bin/bash
# The engine's whole suite as the engine-linux gate runs it, on a private Xvfb (never :0): fmt, clippy, the unit tests,
# and every live test file. Then the harness suite.
# usage: suite.sh <out dir>
set -u
out=$1
mkdir -p "$out"
cd "$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171/native/linux-engine" || exit 2
{ cargo fmt --check && echo "fmt: clean"; } > "$out/fmt.txt" 2>&1
cargo clippy --all-targets --features live -- -D warnings > "$out/clippy.txt" 2>&1 && echo "clippy: clean" >> "$out/clippy.txt"
cargo test > "$out/unit.txt" 2>&1
timeout 5400 xvfb-run -a dbus-run-session --dbus-daemon="$PWD/tests/dbus-daemon-quiet" -- cargo test --features live -- --test-threads 1 > "$out/live.txt" 2>&1
echo "live exit $?" >> "$out/live.txt"
cd "$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171" || exit 2
npm run test:linux-engine-diff > "$out/harness.txt" 2>&1
echo "harness exit $?" >> "$out/harness.txt"
tail -2 "$out/fmt.txt" "$out/clippy.txt"
grep -E '^test result|Running' "$out/unit.txt" "$out/live.txt" | sed 's#.*/deps/##'
tail -1 "$out/live.txt"
grep -E '^# (tests|pass|fail)' "$out/harness.txt"
tail -1 "$out/harness.txt"
