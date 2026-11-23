#!/bin/bash
# Task 116 on arm64 (ruling 897's condition): the ping's reading on Chrome 158 (T7's extracted copy, first on PATH; the
# held 156 left alone), after the Electron set (its script's pid): V5's draggable cells and the scene's select control,
# at twice the load and idle, private displays, wave 2, 10 blocks each.
# usage: c158-after.sh <pid to wait for>
T=/Users/new/.local/share/cua-171/task116
D=/Users/new/.local/share/cua-171
while kill -0 "$1" 2>/dev/null; do sleep 30; done
export CHROME_BIN=$D/chrome-stable/158.0.8127.36-1/bin
echo "$(date -u +%FT%TZ) Chrome 158 set: $("$CHROME_BIN/google-chrome" --version)" >> "$T/arm64-w2/chain.log"
OUTDIR=$T/arm64-w2 BLOCKS=10 "$T/scripts/arm-chain.sh" "$(readlink -f "$T/bin/wave2-arm64")" v5-2-c158 sel-2-c158 v5-0-c158 sel-0-c158
