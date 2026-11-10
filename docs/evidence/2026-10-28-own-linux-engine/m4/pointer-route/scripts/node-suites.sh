#!/bin/bash
# Task 71's JavaScript suites (run under the host lock): cua's Linux service's tests, then the harness suite as
# `npm run test:linux-engine-diff` runs it, each log under $T/suites/<label>-*.log; then their summary lines.
# usage: node-suites.sh <label>
set -u
d=$(cd "$(dirname "$0")" && pwd)
. "$d/env.sh"
label=$1
mkdir -p "$T/suites"
cd "$WT"
node --test test/services-engine-linux/*.test.mjs > "$T/suites/$label-services.log" 2>&1
echo "services status $?"
npm run test:linux-engine-diff > "$T/suites/$label-harness.log" 2>&1
echo "harness status $?"
grep -hE '^ℹ (tests|pass|fail|skipped)|^# (tests|pass|fail|skipped)' "$T/suites/$label-services.log" "$T/suites/$label-harness.log"
