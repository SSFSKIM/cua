#!/usr/bin/env bash
# Runs live-node-watchdog.mjs against an Xvfb of the script's own, marked private (private-x.sh). $1: out directory.
set -u
OUT="${1:?out}"; mkdir -p "$OUT"
HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=private-x.sh
. "$HERE/private-x.sh"
start_own_x; xvfb=$OWN_XVFB
trap 'kill -CONT $xvfb 2>/dev/null; kill $xvfb 2>/dev/null' EXIT
mark_private
XVFB_PID=$xvfb timeout 60 node "$HERE/live-node-watchdog.mjs" "$OUT/watchdog.jsonl" 2>&1 | tee "$OUT/node.txt"
cat "$OUT/watchdog.jsonl"
