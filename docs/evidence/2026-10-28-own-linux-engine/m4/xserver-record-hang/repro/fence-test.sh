#!/usr/bin/env bash
# #171 task 44: the repro's fence, on X servers this test starts itself only (private-x.sh). A server that does not
# start stops the repro before anything reaches a display; an unmarked server of its own is refused; a marked one is
# not. The load's and the record client's own refusals are flood's `cargo test` (tests/fence.rs) and xprobe's.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
fail() { echo "FAIL: $*"; exit 1; }
scratch=$(mktemp -d); trap 'rm -rf "$scratch"' EXIT

# 1. a server that does not start: start_own_x exits 2, DISPLAY never set to anything
out=$(XVFB=false bash -c '. "$1/private-x.sh"; start_own_x; echo "reached $DISPLAY"' _ "$HERE" 2>&1); code=$?
{ [ "$code" = 2 ] && ! grep -q reached <<<"$out"; } || fail "a server that did not start went on (exit $code): $out"
echo "ok 1: a server that does not start stops the script ($out)"

# 2. the repro itself: no record client and no load once its server failed
out=$(XVFB=false "$HERE/repro-stall.sh" "$scratch/run" 10 2>&1); code=$?
{ [ "$code" = 2 ] && [ ! -e "$scratch/run/record.jsonl" ] && [ ! -e "$scratch/run/ping.log" ]; } || fail "repro-stall.sh ran without its server (exit $code): $out"
echo "ok 2: repro-stall.sh stops before its record and load ($out)"

# 3. its own server, unmarked: refused
out=$(bash -c '. "$1/private-x.sh"; start_own_x; trap "kill \$OWN_XVFB" EXIT; require_private; echo reached' _ "$HERE" 2>&1); code=$?
{ [ "$code" = 2 ] && ! grep -q reached <<<"$out"; } || fail "an unmarked display was not refused (exit $code): $out"
echo "ok 3: an unmarked display is refused ($out)"

# 4. marked: reached
out=$(bash -c '. "$1/private-x.sh"; start_own_x; trap "kill \$OWN_XVFB" EXIT; mark_private; echo "reached $DISPLAY"' _ "$HERE" 2>&1); code=$?
{ [ "$code" = 0 ] && grep -q '^reached :[0-9]' <<<"$out"; } || fail "a marked display of its own was refused (exit $code): $out"
echo "ok 4: a marked display of its own is reached ($out)"
echo PASS
