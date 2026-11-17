#!/usr/bin/env bash
# The two repl-parity tests that fail on the #171 VM, each run alone with its full output: at the base of M4's T4
# (4d6b33a7) and at T4's final fix head (b8b79a25), each on a detached checkout that borrows the worktree's node_modules
# and is removed afterwards. Writes base.log and head.log beside this script.
set -u
WT="${WT:-/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171}"
OUT="$(cd "$(dirname "$0")" && pwd)"
BASE_COMMIT=4d6b33a7
HEAD_COMMIT=b8b79a25
CHECKOUT="$HOME/.local/share/cua-171/task34/base-checkout"
TESTS=(
  'test/repl-parity/selection-cache.test.mjs|ordinary selection calls record a complete cold handshake and reuse it on the next call'
  'test/repl-parity/socket-error-peer.test.mjs|owned peer stays open before input and aborts mid-stream with a real transport error'
)
run() {
  local dir="$1" label="$2" log="$OUT/$2.log"
  {
    echo "# $label: $(git -C "$dir" rev-parse HEAD) ($(git -C "$dir" log -1 --format=%s))"
    echo "# node $(node --version), $(uname -srm)"
    for entry in "${TESTS[@]}"; do
      local file="${entry%%|*}" name="${entry#*|}"
      echo
      echo "## $file: $name"
      (cd "$dir" && node --test --test-reporter=spec --test-name-pattern="^${name}\$" "$file" 2>&1)
      echo "## exit $?"
    done
  } > "$log"
}
at() {
  local commit="$1" label="$2"
  rm -rf "$CHECKOUT"
  git -C "$WT" worktree add --detach "$CHECKOUT" "$commit" >/dev/null 2>&1
  ln -s "$WT/node_modules" "$CHECKOUT/node_modules"
  run "$CHECKOUT" "$label"
  git -C "$WT" worktree remove --force "$CHECKOUT"
}
at "$BASE_COMMIT" base
at "$HEAD_COMMIT" head
