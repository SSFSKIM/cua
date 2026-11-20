#!/bin/bash
# Task 116: after the idle wave-2 set (its script's pid), Electron's short drag and drop idle and at twice the load on
# wave 2 (edn-0-1, edn-2-1): whether a press on an Electron draggable source turns its pings slow, as Chrome's does.
# usage: edn-after.sh <x64|arm64> <pid to wait for>
T=/Users/new/.local/share/cua-171/task116
while kill -0 "$2" 2>/dev/null; do sleep 30; done
case $1 in x64) chain=$T/scripts/x64-chain.sh ;; arm64) chain=$T/scripts/arm-chain.sh ;; *) exit 2 ;; esac
OUTDIR=$T/$1-w2 "$chain" "$(readlink -f "$T/bin/wave2-$1")" edn-0-1 edn-2-1
