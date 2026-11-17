#!/bin/bash
# The tests task 70 changes, run focused: the families table's unit tests and the Gecko and Chromium device-mode live
# tests, each log under $T/tdd/<label>-{unit,live}.log.
# usage: focused-tests.sh <label>
set -u
d=$(cd "$(dirname "$0")" && pwd)
. "$d/env.sh"
mkdir -p "$T/tdd"
"$d/engine-tests.sh" unit --bin cua-engine -- families:: way:: > "$T/tdd/$1-unit.log" 2>&1
"$d/engine-tests.sh" live --test live_device -- --test-threads 1 gecko_takes clicks_to_a_window chromium_drag_takes > "$T/tdd/$1-live.log" 2>&1
grep -hE '^test |test result' "$T/tdd/$1-unit.log" "$T/tdd/$1-live.log"
