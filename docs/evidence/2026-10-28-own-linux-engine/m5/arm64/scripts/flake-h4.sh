#!/bin/bash
# Task 99 (T7 part 2): the npm test failures at H'''' only (both in test/native-baseline/run.test.mjs) checked for a
# flake by ruling 743, as at H''': the file alone, run alternately at H'''' (t7-h4) and main (t7-main2, 517ab543),
# N times each, in one hold of the host lock (holder t7-arm64). Each run's failing count is read from its own log
# (each run's exit is taken into a variable straight after it ends; ruling 774).
set -u
D=/Users/new/.local/share/cua-171
T=$D/task99
W=/Users/new/Developer/GitHub/cua/.claude/worktrees
N=${N:-10}
export PATH=$D/node24/bin:$PATH
flake() {
  local i c status
  for i in $(seq 1 "$N"); do
    for c in t7-h4 t7-main2; do
      (cd "$W/$c" && node --test test/native-baseline/run.test.mjs > "$T/proof-h4/flake-$c-$i.log" 2>&1)
      status=$?
      echo "$(date -u +%FT%TZ) $c run $i exit $status load $(cut -d' ' -f1 /proc/loadavg) fail $(grep -a '^ℹ fail' "$T/proof-h4/flake-$c-$i.log" | cut -d' ' -f3)"
    done
  done
}
export -f flake; export T W N
"$D/locked.sh" t7-arm64 timeout -s TERM -k 120 40m bash -c flake > "$T/proof-h4/flake-run-test.log" 2>&1
status=$?
echo "== flake exit $status end $(date -u +%FT%TZ)" >> "$T/proof-h4/flake-run-test.log"
for c in t7-h4 t7-main2; do
  echo "== $c: failing tests over the $N runs (each listed twice in a log, inline and in its failing list)"
  cat "$T"/proof-h4/flake-$c-*.log | grep -a '^✖ ' | grep -v 'failing tests' | sed -E 's/ \([0-9.]+ms\)$//' | sort | uniq -c
done >> "$T/proof-h4/flake-run-test.log"
echo "flake-h4 done $(date -u +%FT%TZ)" >> "$T/proof-h4/flake-run-test.log"
