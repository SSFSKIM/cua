#!/bin/bash
# task 89, step 2: H's local proof (rulings 742, 743), before any counted step. GitHub Actions is locked by a billing
# issue, so ci-gate on H waits for it to return; until then H is proven here. Each part runs under the host lock with
# its own timeout (run by proof-all.sh). The lines are .github/ci-kit.yml's at H; cargo through the lock's wrapper.
#   npm-test <worktree> <name>  `npm test` (the `test` gate's first half) in that checkout; run at H and at main
#                               b99232de, since about 51 tests fail on this VM for platform reasons (ruling 743)
#   harness                     `npm run test:linux-engine-diff` (the `test` gate's second half)
#   harness-dbus                the harness-dbus gate's run line (its apt line: the packages are installed)
#   engine-static               engine-linux: rustup's toolchain and target, fmt, both clippy runs, the musl build
#   engine-live                 engine-linux: cargo test --features live under xvfb-run -a dbus-run-session, GTK required
#   two-screens                 engine-linux: tests/two-screens.sh
set -u
T=/Users/new/.local/share/cua-171/task89
WT=/Users/new/Developer/GitHub/cua/.claude/worktrees/t5-x64
export PATH=/Users/new/.local/share/cua-171/bin:/Users/new/.cargo/bin:$PATH
part=$1
echo "== $part start $(date -u +%FT%TZ) load $(cut -d' ' -f1-3 /proc/loadavg)"
case "$part" in
  npm-test)
    cd "$2" || exit 2
    echo "== $(pwd) at $(git rev-parse HEAD), $(git status --porcelain | wc -l) changes"
    npm test ;;
  harness)
    cd "$WT" && echo "== at $(git rev-parse HEAD)" && npm run test:linux-engine-diff ;;
  harness-dbus)
    cd "$WT" && echo "== at $(git rev-parse HEAD)" && CUA171_DBUS_TESTS=required node test/linux-engine-diff/suite-check.mjs test/linux-engine-diff/a11y-stub.test.mjs test/linux-engine-diff/leak-check.test.mjs test/linux-engine-diff/session-bus.test.mjs test/linux-engine-diff/audit-proxy-lifetime.test.mjs ;;
  engine-static)
    cd "$WT/native/linux-engine" || exit 2
    set -e
    echo "== cargo: $(command -v cargo)"
    rustup toolchain install
    rustup target add x86_64-unknown-linux-musl
    rustc --version
    cargo fmt --check
    cargo clippy --release --locked --target x86_64-unknown-linux-musl --all-targets --features live -- -D warnings
    cargo clippy --release --locked --target x86_64-unknown-linux-musl -- -D warnings
    cargo build --release --locked --target x86_64-unknown-linux-musl ;;
  engine-live)
    cd "$WT/native/linux-engine" || exit 2
    echo "== cargo: $(command -v cargo)"
    CUA171_GTK_TESTS=required xvfb-run -a dbus-run-session --dbus-daemon="$PWD/tests/dbus-daemon-quiet" -- cargo test --release --locked --target x86_64-unknown-linux-musl --features live -- --test-threads 1 ;;
  two-screens)
    cd "$WT/native/linux-engine" || exit 2
    echo "== cargo: $(command -v cargo)"
    tests/two-screens.sh ;;
  *) echo "unknown part $part"; exit 2 ;;
esac
s=$?
echo "== $part exit $s end $(date -u +%FT%TZ)"
exit $s
