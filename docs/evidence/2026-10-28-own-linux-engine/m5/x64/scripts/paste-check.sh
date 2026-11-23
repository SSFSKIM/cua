#!/bin/bash
# Task 89 (ruling 743): the one npm test failure at H that main lacks, test/browser-service/paste.test.mjs. Whether the
# two heads differ in it or in what it tests, then the file alone 10 times at H and at main (run under the lock).
set -u
W=/Users/new/Developer/GitHub/cua/.claude/worktrees
cd "$W/t5-x64"
echo "== diff b99232de..fefe306c, the test and src/browser-service:"
git diff --stat b99232de fefe306c -- test/browser-service/paste.test.mjs src/browser-service | tail -3
echo "== (end of diff)"
for wt in t5-x64 t5-main; do
  cd "$W/$wt"
  pass=0; fail=0
  for i in $(seq 1 10); do
    if node --test test/browser-service/paste.test.mjs > /tmp/t89-paste.out 2>&1; then pass=$((pass+1)); else fail=$((fail+1)); grep -m2 "AssertionError\|✖" /tmp/t89-paste.out; fi
  done
  echo "$wt at $(git rev-parse --short HEAD): $pass pass, $fail fail of 10"
done
rm -f /tmp/t89-paste.out
