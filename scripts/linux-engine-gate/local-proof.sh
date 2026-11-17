#!/bin/bash
# A head's local proof (#171 M5; rulings 742, 743 and 774): .github/ci-kit.yml's Linux gate lines, run on the VM when
# hosted ci-gate cannot run (GitHub Actions locked), each part with its own timeout and, when PROOF_LOCK names one,
# under the host lock. From T5's task89 local-proof.sh and proof-all.sh, made one script that T7 runs as is, with
# ruling 774's fix: each part's exit is read into a variable the moment the part ends, before anything else runs. T5's
# summary wrote `$(date …) <part> exit $?`, whose `$?` was the date's, so every part read exit 0.
#
#   local-proof.sh <out dir> <checkout> [<compare checkout>]   every part in order; a log per part in <out dir>, one
#                                                              line per part in <out dir>/proof.log and its result last
#   local-proof.sh --part <name> <checkout>                    one part in the foreground (what each part runs)
#
# The parts (ci-kit.yml's lines; the apt lines are left out, so the packages must be installed):
#   npm-test           `npm test` in the checkout (the `test` gate's first half)
#   npm-test-compare   `npm test` in the compare checkout, when one is named: on the VM some tests fail for platform
#                      reasons, and by ruling 743 the head passes when it fails nothing the compare checkout doesn't
#   harness            `npm run test:linux-engine-diff` (the `test` gate's second half)
#   harness-dbus       the harness-dbus gate's run line
#   engine-static      engine-linux: rustup's toolchain and target, fmt, both clippy runs, the musl build
#   engine-live        engine-linux: cargo test --features live under xvfb-run -a dbus-run-session, GTK required
#   two-screens        engine-linux: tests/two-screens.sh
# engine-linux's musl target is this machine's (x86_64- or aarch64-unknown-linux-musl, as linux-engine.yml builds each).
#
# The result is strict: the proof passes only when every part ran and exited 0. npm test's platform failures make its
# parts exit nonzero on the VM, so there the proof's line reads FAIL and the npm-test pair is judged by ruling 743's
# comparison of the two logs, on its own; the summary never reports a part's exit other than as it was.
#
# Environment:
#   PROOF_LOCK   the host lock's command prefix each part runs under (e.g. "$HOME/.local/share/cua-171/locked.sh t7-arm64");
#                unset or empty: unlocked
#   PROOF_HOLD   a file (hold-sittings) whose presence keeps every later part from running; each counts as not run
#   PROOF_PARTS  the parts to run, comma-separated, in that order (default: all of them, npm-test-compare only with a
#                compare checkout)
# Exit: 0 when the proof passes, 1 when it does not, 2 on a usage error.
set -u

PARTS_ALL=(npm-test npm-test-compare harness harness-dbus engine-static engine-live two-screens)
timeout_of() {
  case "$1" in
    npm-test|npm-test-compare|two-screens) echo 30m ;;
    harness|engine-static|engine-live) echo 45m ;;
    harness-dbus) echo 15m ;;
  esac
}

musl_target() {
  case "$(uname -m)" in
    x86_64) echo x86_64-unknown-linux-musl ;;
    aarch64|arm64) echo aarch64-unknown-linux-musl ;;
    *) echo "local-proof: no musl target for $(uname -m)" >&2; return 2 ;;
  esac
}

# one part, in the foreground, its output to stdout: its own exit
run_part() {
  local part=$1 checkout=$2 target
  echo "== $part start $(date -u +%FT%TZ) load $(cut -d' ' -f1-3 /proc/loadavg 2>/dev/null)"
  case "$part" in
    npm-test|npm-test-compare)
      cd "$checkout" || return 2
      echo "== $(pwd) at $(git rev-parse HEAD 2>&1), $(git status --porcelain 2>/dev/null | wc -l) changes"
      npm test ;;
    harness)
      cd "$checkout" || return 2
      echo "== at $(git rev-parse HEAD 2>&1)"
      npm run test:linux-engine-diff ;;
    harness-dbus)
      cd "$checkout" || return 2
      echo "== at $(git rev-parse HEAD 2>&1)"
      CUA171_DBUS_TESTS=required node test/linux-engine-diff/suite-check.mjs test/linux-engine-diff/a11y-stub.test.mjs test/linux-engine-diff/leak-check.test.mjs test/linux-engine-diff/session-bus.test.mjs test/linux-engine-diff/audit-proxy-lifetime.test.mjs test/linux-engine-diff/wrap71-own-proxy.test.mjs test/linux-engine-diff/local-proof.test.mjs
      ;;
    engine-static)
      target=$(musl_target) || return 2
      cd "$checkout/native/linux-engine" || return 2
      echo "== cargo: $(command -v cargo), target $target"
      # a subshell, so the first failing line ends the part with that line's exit
      (
        set -e
        rustup toolchain install
        rustup target add "$target"
        rustc --version
        cargo fmt --check
        cargo clippy --release --locked --target "$target" --all-targets --features live -- -D warnings
        cargo clippy --release --locked --target "$target" -- -D warnings
        cargo build --release --locked --target "$target"
      ) ;;
    engine-live)
      target=$(musl_target) || return 2
      cd "$checkout/native/linux-engine" || return 2
      echo "== cargo: $(command -v cargo), target $target"
      CUA171_GTK_TESTS=required xvfb-run -a dbus-run-session --dbus-daemon="$PWD/tests/dbus-daemon-quiet" -- cargo test --release --locked --target "$target" --features live -- --test-threads 1 ;;
    two-screens)
      cd "$checkout/native/linux-engine" || return 2
      echo "== cargo: $(command -v cargo)"
      tests/two-screens.sh ;;
    *) echo "unknown part $part" >&2; return 2 ;;
  esac
}

if [ "${1:-}" = --part ]; then
  [ $# -eq 3 ] || { echo "usage: local-proof.sh --part <name> <checkout>" >&2; exit 2; }
  run_part "$2" "$3"
  status=$?
  echo "== $2 exit $status end $(date -u +%FT%TZ)"
  exit "$status"
fi

[ $# -ge 2 ] && [ $# -le 3 ] || { echo "usage: local-proof.sh <out dir> <checkout> [<compare checkout>]" >&2; exit 2; }
out=$1 checkout=$(realpath "$2") compare=${3:+$(realpath "$3")}
[ -d "$checkout" ] && { [ $# -lt 3 ] || [ -d "$compare" ]; } || { echo "local-proof: no checkout at $2${3:+ or $3}" >&2; exit 2; }
if [ -n "${PROOF_PARTS:-}" ]; then
  IFS=, read -ra parts <<<"$PROOF_PARTS"
else
  parts=()
  for p in "${PARTS_ALL[@]}"; do [ "$p" = npm-test-compare ] && [ -z "$compare" ] && continue; parts+=("$p"); done
fi
for p in "${parts[@]}"; do
  [ -n "$(timeout_of "$p")" ] || { echo "local-proof: unknown part $p" >&2; exit 2; }
  [ "$p" = npm-test-compare ] && [ -z "$compare" ] && { echo "local-proof: npm-test-compare needs a compare checkout" >&2; exit 2; }
done
read -ra lock <<<"${PROOF_LOCK:-}"
mkdir -p "$out" || exit 2
summary=$out/proof.log
self=$(realpath "$0")
failed=()
echo "$(date -u +%FT%TZ) proof of $checkout${compare:+ (compare $compare)}: ${parts[*]}${PROOF_LOCK:+, each under $PROOF_LOCK}" >> "$summary"
for p in "${parts[@]}"; do
  if [ -n "${PROOF_HOLD:-}" ] && [ -e "$PROOF_HOLD" ]; then
    echo "$(date -u +%FT%TZ) $p not run: the hold $PROOF_HOLD is present" >> "$summary"
    failed+=("$p not run")
    continue
  fi
  dir=$checkout
  [ "$p" = npm-test-compare ] && dir=$compare
  "${lock[@]}" timeout -s TERM -k 120 "$(timeout_of "$p")" "$self" --part "$p" "$dir" > "$out/$p.log" 2>&1
  status=$?  # the part's own exit, read before anything else runs (ruling 774)
  echo "$(date -u +%FT%TZ) $p exit $status ($out/$p.log)" >> "$summary"
  [ "$status" -eq 0 ] || failed+=("$p exit $status")
done
if [ ${#failed[@]} -eq 0 ]; then
  echo "proof: PASS: every part exited 0 (${parts[*]})" | tee -a "$summary"
  exit 0
fi
result=$(IFS=,; echo "${failed[*]}")
echo "proof: FAIL: ${result//,/, }" | tee -a "$summary"
exit 1
