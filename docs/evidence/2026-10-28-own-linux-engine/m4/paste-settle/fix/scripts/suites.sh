#!/bin/bash
# The reruns on the checkout's head: the engine's unit and live suites (cargo, live feature, private Xvfb), fmt and
# clippy, the harness suite, and kernel-child with the engine-stop judges.
set -u
W=$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171
O=$HOME/.local/share/cua-171/task60-fix
cd "$W/native/linux-engine" || exit 2
(cargo fmt --check && cargo clippy --release --features live --all-targets -- -D warnings) > "$O/fmt-clippy.txt" 2>&1
echo "fmt+clippy exit $?"
"$O/scripts/live.sh" "$O/all-live-final.txt" > /dev/null 2>&1
echo "live exit $?"; grep -E "Running|test result" "$O/all-live-final.txt"
cd "$W" || exit 2
npm run test:linux-engine-diff > "$O/harness-suite.txt" 2>&1
echo "harness exit $?"; grep -E "^ℹ (tests|pass|fail)" "$O/harness-suite.txt"
node --test test/repl-host/kernel-child.test.mjs test/linux-engine-diff/engine-stop.test.mjs > "$O/kernel-child.txt" 2>&1
echo "judges exit $?"; grep -E "^ℹ (tests|pass|fail)" "$O/kernel-child.txt"
