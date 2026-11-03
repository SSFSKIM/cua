#!/usr/bin/env bash
# Runs live-node-watchdog.mjs against a private Xvfb :94 of its own. $1: out directory.
set -u
OUT="${1:?out}"; mkdir -p "$OUT"
auth=$(mktemp -d)/Xauthority; touch "$auth"; xauth -q -f "$auth" add :94 . "$(mcookie)"
export XAUTHORITY="$auth" DISPLAY=:94
Xvfb :94 -noreset -screen 0 1280x800x24 -nolisten tcp -auth "$auth" >/dev/null 2>&1 & xvfb=$!
trap 'kill -CONT $xvfb 2>/dev/null; kill $xvfb 2>/dev/null; rm -rf "$(dirname "$auth")"' EXIT
for _ in $(seq 50); do timeout 1 xprop -root >/dev/null 2>&1 && break; sleep 0.1; done
XVFB_PID=$xvfb timeout 60 node /Users/new/.local/share/cua-171/task41/live-node-watchdog.mjs "$OUT/watchdog.jsonl" 2>&1 | tee "$OUT/node.txt"
cat "$OUT/watchdog.jsonl"
