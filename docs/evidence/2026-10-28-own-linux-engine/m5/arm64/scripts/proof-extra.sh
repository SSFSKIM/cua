#!/bin/bash
# Task 99 (T7): two follow-ups to H'''s local proof on arm64, each its own hold of the host lock (holder t7-arm64).
# 1. two-screens on aarch64. native/linux-engine/tests/two-screens.sh names `--target x86_64-unknown-linux-musl`, which
#    this arm64 VM has no std for, so its part failed before any test ran. A copy of the script, made here outside the
#    checkout (the pinned rule keeps native/linux-engine as released), with only two lines changed: its `cd` names the
#    T7 checkout's native/linux-engine, and its target is aarch64-unknown-linux-musl, the one the engine-live part used.
#    The diff is printed first.
# 2. the two npm test failures at H''' only (test/native-baseline/run.test.mjs), checked for a flake as T5 checked
#    paste.test.mjs (ruling 743): the file alone, run alternately at H''' (t7-arm64) and main (t7-main), N times each.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task99
W=/Users/new/Developer/GitHub/cua/.claude/worktrees
N=${N:-10}
export PATH=$D/node24/bin:$D/bin:/Users/new/.cargo/bin:$PATH
L="$D/locked.sh t7-arm64"
src=$W/t7-arm64/native/linux-engine/tests/two-screens.sh
cp=$T/two-screens-aarch64.sh
sed -e "s#^cd \"\$(dirname \"\$0\")/..\"\$#cd $W/t7-arm64/native/linux-engine#" -e 's/--target x86_64-unknown-linux-musl/--target aarch64-unknown-linux-musl/' "$src" > "$cp"
chmod +x "$cp"
{
  echo "== $(date -u +%FT%TZ) the copy's diff against $src:"
  diff "$src" "$cp"
  echo "== run"
} > "$T/proof/two-screens-aarch64.log" 2>&1
$L timeout -s TERM -k 120 30m "$cp" >> "$T/proof/two-screens-aarch64.log" 2>&1
echo "== two-screens-aarch64 exit $? end $(date -u +%FT%TZ)" >> "$T/proof/two-screens-aarch64.log"
flake() {
  local i
  for i in $(seq 1 "$N"); do
    for c in t7-arm64 t7-main; do
      (cd "$W/$c" && node --test test/native-baseline/run.test.mjs > "$T/proof/flake-$c-$i.log" 2>&1)
      echo "$(date -u +%FT%TZ) $c run $i exit $? load $(cut -d' ' -f1 /proc/loadavg) fail $(grep -a '^ℹ fail' "$T/proof/flake-$c-$i.log" | cut -d' ' -f3)"
    done
  done
}
export -f flake; export T W N
$L timeout -s TERM -k 120 40m bash -c flake > "$T/proof/flake-run-test.log" 2>&1
echo "== flake exit $? end $(date -u +%FT%TZ)" >> "$T/proof/flake-run-test.log"
echo "proof-extra done $(date -u +%FT%TZ)" >> "$T/proof/flake-run-test.log"
