#!/bin/bash
# Task 89 (ruling 743): paste.test.mjs alone, alternating H and main, 20 times each (so neither runs only first or
# only after the other), and what the test imports that differs between the heads (run under the lock).
set -u
W=/Users/new/Developer/GitHub/cua/.claude/worktrees
cd "$W/t5-x64"
echo "== the test's imports:"; grep -E "^import" test/browser-service/paste.test.mjs
echo "== diff b99232de..fefe306c under src/ and test/helpers/:"
git diff --stat b99232de fefe306c -- src test/helpers | tail -5
declare -A pass fail
for i in $(seq 1 20); do
  for wt in t5-x64 t5-main; do
    cd "$W/$wt"
    if node --test test/browser-service/paste.test.mjs > /dev/null 2>&1; then pass[$wt]=$(( ${pass[$wt]:-0} + 1 )); else fail[$wt]=$(( ${fail[$wt]:-0} + 1 )); fi
  done
done
for wt in t5-x64 t5-main; do echo "$wt: ${pass[$wt]:-0} pass, ${fail[$wt]:-0} fail of 20 (alternating)"; done
