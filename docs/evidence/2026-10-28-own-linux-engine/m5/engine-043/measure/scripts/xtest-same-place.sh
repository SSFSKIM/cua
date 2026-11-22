#!/bin/bash
# Task 132 (the coordinator's 1029) on the arm64 VM: xtest-same-place.py once on a private Xorg (the dummy driver, no
# input devices, tests/xorg-resizable.conf, as tests/two-screens.sh starts it, the first free display from :100, never
# :0) and once on a private Xvfb (the first free display from :100) for comparison, under the host lock (holder task132-arm64). No Chrome.
# Only the servers this script started are stopped. usage: xtest-same-place.sh [core|xi2] (the follow-up: xi2, XI_Motion)
set -u
D=/Users/new/.local/share/cua-171
T=$D/task132
OUT=$T/out/xtest-1029; MODE=${1:-core}; SFX=$([ "$MODE" = xi2 ] && echo -xi2)
mkdir -p "$OUT"
cd /Users/new/Developer/GitHub/cua/.claude/worktrees/t132-h71/native/linux-engine || exit 2
exec "$D/locked.sh" task132-arm64 bash -c '
  OUT='"$OUT"'; T='"$T"'; MODE='"$MODE"'; SFX='"$SFX"'
  for candidate in $(seq 100 163); do
    [ -e "/tmp/.X$candidate-lock" ] || [ -e "/tmp/.X11-unix/X$candidate" ] || break
  done
  /usr/lib/xorg/Xorg ":$candidate" -config "$PWD/tests/xorg-resizable.conf" -logfile "$OUT/xorg$SFX.log" -noreset -nolisten tcp \
    -sharevts -novtswitch -keeptty -seat "seat-cua-t132-$$" > "$OUT/xorg.out" 2>&1 &
  xorg=$!
  for _ in $(seq 100); do [ -e "/tmp/.X11-unix/X$candidate" ] && break; sleep 0.1; done
  sleep 0.5
  echo "Xorg on :$candidate (pid $xorg)"
  DISPLAY=":$candidate" timeout 60 python3 -I "$T/scripts/xtest-same-place.py" 10 "$MODE" > "$OUT/xorg$SFX.jsonl" 2> "$OUT/xorg$SFX.err"; echo "xorg probe exit $?"
  kill "$xorg"; wait "$xorg" 2>/dev/null
  for n in $(seq 100 163); do
    [ -e "/tmp/.X$n-lock" ] || [ -e "/tmp/.X11-unix/X$n" ] || break
  done
  Xvfb ":$n" -screen 0 1280x800x24 -nolisten tcp > "$OUT/xvfb.out" 2>&1 &
  xvfb=$!
  for _ in $(seq 100); do [ -e "/tmp/.X11-unix/X$n" ] && break; sleep 0.1; done
  sleep 0.5
  echo "Xvfb on :$n (pid $xvfb)"
  DISPLAY=":$n" timeout 60 python3 -I "$T/scripts/xtest-same-place.py" 10 "$MODE" > "$OUT/xvfb$SFX.jsonl" 2> "$OUT/xvfb$SFX.err"; echo "xvfb probe exit $?"
  kill "$xvfb"; wait "$xvfb" 2>/dev/null
  tail -1 "$OUT/xorg$SFX.jsonl"; tail -1 "$OUT/xvfb$SFX.jsonl"'
