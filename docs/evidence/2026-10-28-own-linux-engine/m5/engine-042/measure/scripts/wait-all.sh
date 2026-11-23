#!/bin/bash
# Task 116: waits (at most ~5 h) until a host's task-116 chains and waiters have all ended (WHICH=x64|arm64|either), or
# hold-sittings appears on arm64, then prints both hosts' chain tails.
T=/Users/new/.local/share/cua-171/task116
P='task116/scripts/(x64|arm)-(chain|plan|plan2|sel|idle-w2|resume|start)\.sh|task116/scripts/(edn-after|c158-after|arm-idle-w2|x64-idle-w2)\.sh|scripts/x64-plan2\.sh'
x() { pgrep -f "$P" > /dev/null; }
a() { timeout 20 ssh cua-171-arm64 "pgrep -f '$P' > /dev/null"; }
h() { timeout 20 ssh cua-171-arm64 'test -e /Users/new/.local/share/cua-171/hold-sittings'; }
for i in $(seq 1 600); do
  h && { echo "hold-sittings on arm64"; break; }
  case ${WHICH:-either} in
    x64) x || break ;;
    arm64) a || break ;;
    either) { x && a; } || break ;;
  esac
  sleep 30
done
tail -n 4 "$T"/x64*/chain.log
timeout 20 ssh cua-171-arm64 "tail -n 4 $T/arm64*/chain.log" || true
