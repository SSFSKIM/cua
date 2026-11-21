#!/bin/bash
# Task 130: the Chromium bug repro with no cua, at cua 0.4.2's background-route pacing (synth-drag.c): core events by
# SendEvent to Chrome's window, 1 px every <step us> by elapsed time, each with a round trip, the release at once after
# the last motion, the path through the zone and out of it to 60 px left of it. On a private Xvfb display of its own
# (never :0), a fresh Chrome profile in a home of the run's own opens page.html (task 126's); N drags, each judged by
# the page's title: a drop counted (the release was outside the zone) is a stale-position drop; a dragend whose
# dropEffect is not none with no drop counted is a false-ok shape (Chrome dropped, the page took nothing).
# Optional load: stress-ng CPU workers per core.
# SYNTH_TAIL_US=8000 in the environment ends each drag as the newest vendor build does (synth-drag.c).
# usage: repro2.sh <n drags> <stress workers per core, 0 for none> [step us, default 500]
set -u
here=$(cd "$(dirname "$0")" && pwd)
N=${1:-30}; LOAD=${2:-0}; STEP=${3:-500}
work=$(mktemp -d)
mkdir -p "$work/home"; export HOME="$work/home"
trap 'kill $(jobs -p) 2>/dev/null; sleep 1; rm -rf "$work"' EXIT
for n in 87 88 89 90 91; do [ -e /tmp/.X11-unix/X$n ] || break; done
Xvfb :$n -screen 0 1280x800x24 -nolisten tcp > /dev/null 2>&1 &
sleep 1
export DISPLAY=:$n
openbox > /dev/null 2>&1 &
sleep 0.5
cp "$here/page.html" "$work/page.html"
google-chrome --user-data-dir="$work/profile" --no-first-run --no-default-browser-check --window-position=0,0 \
  --window-size=900,600 --app="file://$work/page.html" > /dev/null 2>&1 &
sleep 5
wid=$(xdotool search --name xdnd-stale-repro | head -1)
[ -n "$wid" ] || { echo "no window"; exit 1; }
eval "$(xdotool getwindowgeometry --shell "$wid")"
# where the page's origin is in the window: a synthetic motion with no button, read back as the page's clientX/Y
"$here/synth-drag" "$wid" "$X" "$Y" 500 200 200 201 200 > /dev/null 2>&1
sleep 0.5
t=$(xdotool getwindowname "$wid")
echo "window $wid at $X,$Y; probe title: $t"
ox=$(echo "$t" | sed -n 's/.*mm \([0-9-]*\),\([0-9-]*\).*/\1/p'); oy=$(echo "$t" | sed -n 's/.*mm \([0-9-]*\),\([0-9-]*\).*/\2/p')
[ -n "$ox" ] || { echo "no page origin"; exit 1; }
dx=$((200 - ox)); dy=$((200 - oy))
echo "page origin in the window: $dx,$dy"
[ "$LOAD" != 0 ] && { stress-ng --cpu $(( $(nproc) * LOAD )) --quiet & sleep 2; }
stale=0; falseok=0; clean=0
for k in $(seq 1 "$N"); do
  before=$(xdotool getwindowname "$wid")
  d0=$(echo "$before" | grep -o "drops [0-9]*" | tr -dc 0-9)
  "$here/synth-drag" "$wid" "$X" "$Y" "$STEP" $((dx + 60)) $((dy + 40)) $((dx + 400)) $((dy + 40)) $((dx + 400)) $((dy + 180)) $((dx + 240)) $((dy + 180)) > /dev/null
  sleep 1.5
  after=$(xdotool getwindowname "$wid")
  d1=$(echo "$after" | grep -o "drops [0-9]*" | tr -dc 0-9)
  if [ "${d1:-0}" -gt "${d0:-0}" ]; then stale=$((stale + 1)); echo "drag $k: stale: $after"
  elif [ "$after" = "$before" ]; then echo "drag $k: no dragend: $after"
  elif echo "$after" | grep -q "dragend" && ! echo "$after" | grep -q "dragend none"; then falseok=$((falseok + 1)); echo "drag $k: dropped, page took nothing: $after"
  elif echo "$after" | grep -q "dragend none"; then clean=$((clean + 1))
  else echo "drag $k: no dragend: $after"; fi
done
echo "stale-position drops: $stale, dropped with nothing taken: $falseok, clean leaves: $clean, of $N (load $LOAD per core, step $STEP us)"
