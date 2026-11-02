#!/usr/bin/env bash
# The two repl-parity tests that fail on the #171 VM, each run alone with its full output: at the base of M4's T4
# (4d6b33a7, on a detached checkout that borrows the worktree's node_modules and is removed afterwards) and at the
# worktree's head. Writes base.log and head.log beside this script.
set -u
WT="${WT:-/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171}"
OUT="$(cd "$(dirname "$0")" && pwd)"
BASE_COMMIT=4d6b33a7
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
rm -rf "$CHECKOUT"
git -C "$WT" worktree add --detach "$CHECKOUT" "$BASE_COMMIT" >/dev/null 2>&1
ln -s "$WT/node_modules" "$CHECKOUT/node_modules"
run "$CHECKOUT" base
git -C "$WT" worktree remove --force "$CHECKOUT"
run "$WT" head
