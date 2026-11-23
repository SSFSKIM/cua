#!/bin/bash
# A Chromium bug repro with no cua (task 126, ruling 958.2): Chrome drops on a stale position when its X11 drag source
# and target are one window and the release follows the path's last motion at once. On a private Xvfb display, a fresh
# Chrome profile opens page.html; xdotool (XTEST) presses on the source, moves along a long path through the zone to a
# point left of it, one pixel per motion with no pause, and releases at once; N such drags, each judged by the page's
# title: a drop counted though the release was outside the zone is the bug. Optional load: stress-ng CPU workers.
# usage: repro.sh <n drags> <stress workers per core, 0 for none>
set -u
here=$(cd "$(dirname "$0")" && pwd)
N=${1:-30}; LOAD=${2:-0}
work=$(mktemp -d)
# a home of the run's own: nothing of the person's profile or keyring is read or written
mkdir -p "$work/home"; export HOME="$work/home"
trap 'kill $(jobs -p) 2>/dev/null; rm -rf "$work"' EXIT
for n in 77 78 79 80; do [ -e /tmp/.X11-unix/X$n ] || break; done
Xvfb :$n -screen 0 1280x800x24 -nolisten tcp > /dev/null 2>&1 &
sleep 1
export DISPLAY=:$n
openbox > /dev/null 2>&1 &
google-chrome --user-data-dir="$work/profile" --no-first-run --no-default-browser-check --window-position=0,0 \
  --window-size=900,600 --app="file://$here/page.html" > /dev/null 2>&1 &
sleep 4
wid=$(xdotool search --name xdnd-stale-repro | head -1)
[ -n "$wid" ] || { echo "no window"; exit 1; }
eval "$(xdotool getwindowgeometry --shell "$wid")"
[ "$LOAD" != 0 ] && { stress-ng --cpu $(( $(nproc) * LOAD )) --quiet & sleep 2; }
stale=0
for k in $(seq 1 "$N"); do
  before=$(xdotool getwindowname "$wid")
  # one xdotool process for the whole drag, so its motions come as fast as XTEST takes them: into the zone (to x 450),
  # then back out of it to x 250, left of it, and the release at once
  moves=()
  for x in $(seq 60 2 450); do moves+=(mousemove $((X + x)) $((Y + 120))); done
  for x in $(seq 450 -2 250); do moves+=(mousemove $((X + x)) $((Y + 120))); done
  xdotool mousemove $((X + 60)) $((Y + 40)) mousedown 1 mousemove $((X + 64)) $((Y + 44)) sleep 0.05 "${moves[@]}" mouseup 1
  sleep 1.5
  after=$(xdotool getwindowname "$wid")
  d0=$(echo "$before" | grep -o "drops [0-9]*" | tr -dc 0-9); d1=$(echo "$after" | grep -o "drops [0-9]*" | tr -dc 0-9)
  [ "${d1:-0}" -gt "${d0:-0}" ] && { stale=$((stale + 1)); echo "drag $k: $after"; }
done
echo "stale-position drops: $stale of $N (load $LOAD per core)"
