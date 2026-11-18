#!/bin/bash
# Task 98: waits until one of this task's runs has ended (its step.json carries `finished`, or its launcher is gone),
# looking once a minute, then prints its last driver line. Reads only.
# usage: wait-run.sh arm64|x64 <run name> [gate]   (gate: a gate.mjs step directory under out/gate)
HOST=$1; NAME=$2; KIND=${3:-}
T=/Users/new/.local/share/cua-171/task98
if [ "$KIND" = gate ]; then F="$T/out/gate/$NAME.development-run.pilot/step.json"; else F="$T/out/$NAME/step.json"; fi
check() {
  if [ "$HOST" = arm64 ]; then ssh -o ConnectTimeout=20 cua-171-arm64 "grep -q '\"finished\"' $F 2>/dev/null"; else grep -q '"finished"' "$F" 2>/dev/null; fi
}
for i in $(seq 1 60); do
  check && break
  sleep 60
done
if [ "$HOST" = arm64 ]; then ssh cua-171-arm64 "tail -2 $T/out/driver.log | cut -c1-220"; else tail -2 "$T/out/driver.log" | cut -c1-220; fi
