#!/bin/bash
# Task 126: the evidence assembled into docs/evidence/2026-10-28-own-linux-engine/m5/p459/ (scripts, TDD logs, the x64
# runs' summaries, rows and step costs, the repro); the arm64 sets are fetched by collect-arm.sh.
set -u
P=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/m5-p459
E=$P/docs/evidence/2026-10-28-own-linux-engine/m5/p459
S=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/.claude/worktrees/m5-p459-scratch
T=/Users/new/.local/share/cua-171/task126
mkdir -p "$E/scripts" "$E/repro" "$E/tdd" "$E/x64"
cp "$S"/{tdd.sh,full.sh,build.sh,p459.sh,p459-run.mjs,p459-alternate.mjs,p459-tables.mjs,d1.sh,d1-tables.mjs,audit.sh,arm-chain.sh,vm-setup.sh,collect.sh} "$E/scripts/"
[ -e "$S/collect-arm.sh" ] && cp "$S/collect-arm.sh" "$E/scripts/"
cp "$S"/repro/{page.html,repro.sh} "$E/repro/"
cp "$T"/repro/*.txt "$E/repro/" 2>/dev/null
for r in d1-a d1-b audit-a; do
  [ -e "$T/x64/$r/run/summary.md" ] || continue
  mkdir -p "$E/x64/$r"
  cp "$T/x64/$r/run/summary.md" "$T/x64/$r/step.json" "$E/x64/$r/"
  gzip -c "$T/x64/$r/run/results.jsonl" > "$E/x64/$r/results.jsonl.gz"
  [ -d "$T/x64/$r/run/engine-stats" ] && node "$S/d1-tables.mjs" "$T/x64/$r/run" > "$E/x64/$r/step-cost.md"
done
cp "$T/tdd/red-unit.txt" "$T/tdd/gate-unit.txt" "$E/tdd/"
cp "$T/tdd2/red-live.txt" "$E/tdd/"
cp "$T/full3/unit.txt" "$T/full3/focused-live.txt" "$T/full3/clippy.txt" "$E/tdd/"
grep "test result\|suite exit" "$T/full3/suite.txt" > "$E/tdd/suite-summary.txt"
du -sh "$E"
