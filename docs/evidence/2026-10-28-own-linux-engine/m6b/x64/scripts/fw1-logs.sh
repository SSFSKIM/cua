#!/bin/bash
# Fix wave 1 (task 173): the repository ignores *.log (.gitignore L15), so the evidence's logs are renamed to *.log.txt,
# as task 165's evidence names them, and the first pass's setup-failure logs are added beside the chain's log.
set -e
T=/Users/new/.local/share/cua-171/t173
D=$(cd "$T/wt" && pwd -P)/docs/evidence/2026-10-28-own-linux-engine/m6b
mv "$D/ci-gate-default.log" "$D/ci-gate-default.log.txt"
mv "$D/ci-gate-engine-linux.log" "$D/ci-gate-engine-linux.log.txt"
mv "$D/x64/chain.log" "$D/x64/chain.log.txt"
for f in "$D"/x64/regression/logs/*.log; do mv "$f" "$f.txt"; done
mkdir -p "$D/x64/setup-fail-1"
for f in "$T"/setup-fail-1-logs/*.log; do cp "$f" "$D/x64/setup-fail-1/$(basename "$f").txt"; done
find "$D" -name '*.log' -print
ls "$D/x64/regression/logs" "$D/x64/setup-fail-1"
