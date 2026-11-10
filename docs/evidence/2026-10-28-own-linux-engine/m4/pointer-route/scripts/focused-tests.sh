#!/bin/bash
# The engine tests task 71 changes, run focused with the gate's flags: the argument, families and route unit tests and
# the device-mode live tests named, each log under $T/tdd/<label>-{unit,live}.log.
# usage: focused-tests.sh <label> [live test filters...]
set -u
d=$(cd "$(dirname "$0")" && pwd)
. "$d/env.sh"
mkdir -p "$T/tdd"
label=$1
shift
[ $# -gt 0 ] || set -- ignore_cover
"$d/engine-tests.sh" unit --bin cua-engine -- tests:: families:: way:: > "$T/tdd/$label-unit.log" 2>&1
"$d/engine-tests.sh" live --test live_device -- --test-threads 1 "$@" > "$T/tdd/$label-live.log" 2>&1
grep -hE '^test |test result|^error|panicked' "$T/tdd/$label-unit.log" "$T/tdd/$label-live.log" | head -80
