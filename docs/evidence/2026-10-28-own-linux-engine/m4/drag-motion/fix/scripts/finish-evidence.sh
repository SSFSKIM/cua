#!/bin/bash
# Copies the fix wave's sittings, comparison, probes, test logs and scripts into the evidence directory, every home
# path replaced by a label (the wave's work directory by <task66-fix>, task 66's by <task66>, the rest by <home>).
# usage: finish-evidence.sh
set -euo pipefail
f=$HOME/.local/share/cua-171/task66-fix
e=$HOME/Developer/GitHub/cua/.claude/worktrees/cua-171/docs/evidence/2026-10-28-own-linux-engine/m4/drag-motion/fix
label() { sed -e "s#$f#<task66-fix>#g" -e "s#$HOME/.local/share/cua-171/task66#<task66>#g" -e "s#$HOME#<home>#g" "$1"; }
mkdir -p "$e/plan-compare" "$e/held-cost" "$e/tests" "$e/scripts" "$e/sitting"
# the sittings, as task 66's copy-evidence.py copies them (big files gzipped)
sed -e "s#cua-171/task66'#cua-171/task66-fix'#" -e "s#<task66>#<task66-fix>#" "$HOME/.local/share/cua-171/task66/scripts/copy-evidence.py" > "$f/scripts/copy-evidence.py"
python3 -I "$f/scripts/copy-evidence.py" "$f/runs" "$e/sitting" fix-idle-firefox=firefox fix-idle-chrome=chrome
for x in paths.tsv plans.tsv control.tsv compare.rs; do label "$f/plan-compare/$x" > "$e/plan-compare/$x"; done
label "$f/probe/probe_held_cost.rs" > "$e/held-cost/probe_held_cost.rs"
grep -E 'PROBE|test result' "$f/probe-held-cost-db379829.txt" > "$e/held-cost/db379829.txt"
for x in tdd-red-repeat tdd-green-repeat tdd-red-screens tdd-red-screens-xorg tdd-green-screens tdd-green-screens-xorg; do
  grep -E '^test |test result|panicked|assertion|left:|right:|exit' "$f/$x.txt" | label /dev/stdin > "$e/tests/$x.txt"
done
grep -E '^test result|FAILED|panicked' "$f/live-suite-6e9e5b20.txt" > "$e/tests/live-suite-6e9e5b20.txt"
grep -E '^test result|FAILED|panicked' "$f/unit.txt" > "$e/tests/unit.txt"
grep -E '^ℹ ' "$f/suite-harness.txt" > "$e/tests/suite-harness.txt"
for x in plan-compare.sh live-red.sh live-one.sh live-suite.sh probe-held-cost.sh fix-idle.sh drag.sh env.sh \
  private.sh private-run.mjs norecord.mjs build-musl.sh copy-evidence.py finish-evidence.sh two-screens-red.sh; do
  label "$f/scripts/$x" > "$e/scripts/$x"
done
# the two-screen Xorg and its configuration: native/linux-engine/tests/two-screens.sh and xorg-two-screens.conf (the
# follow-up; they replaced this wave's host copies)
du -sh "$e"
grep -rl "$HOME" "$e" || echo "no home paths"
