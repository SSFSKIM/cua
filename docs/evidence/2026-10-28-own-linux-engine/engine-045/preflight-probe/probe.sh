#!/bin/bash
# Task 158, item 3 (#512, ruling 1142.3): what an ordinary X client sees of a Chrome-to-Chrome drag's status, on a
# private Xvfb (never :0). Chrome (the harness's chrome-stable) runs behind xtrace so its X traffic is on record; xprobe
# drop-watch (no RECORD, no grab: what the engine can do on its own connection) watches the real display; xdotool
# (XTEST) drives two drags: A into the zone and released there, B into the zone and out of it, released outside.
# usage: probe.sh <out dir>
set -u
OUT=$1
mkdir -p "$OUT"
P=/Users/new/.local/share/cua-171/task158/probe
XPROBE=/Users/new/.local/share/cua-171/task158/target/release/xprobe
CHROME=/Users/new/.local/share/cua-171/chrome-stable/158.0.8127.36-1/bin/google-chrome
REAL=158
FAKE=159
for d in $REAL $FAKE; do
  if [ -e /tmp/.X11-unix/X$d ]; then echo "display :$d in use"; exit 3; fi
done
Xvfb :$REAL -screen 0 1024x768x24 -nolisten tcp -noreset > "$OUT/xvfb.log" 2>&1 &
XVFB=$!
sleep 1
export DISPLAY=:$REAL
xtrace -n -d :$REAL -D :$FAKE -k -o "$OUT/xtrace.txt" > "$OUT/xtrace.log" 2>&1 &
XTRACE=$!
sleep 1
# the watch, on the real display, until its stdin closes
mkfifo "$OUT/watch.in"
"$XPROBE" drop-watch < "$OUT/watch.in" > "$OUT/watch.jsonl" 2> "$OUT/watch.err" &
WATCH=$!
exec 7> "$OUT/watch.in"
HOME_DIR=$(mktemp -d /tmp/t158-chrome.XXXXXX)
DISPLAY=:$FAKE setsid "$CHROME" --user-data-dir="$HOME_DIR" --no-first-run --no-default-browser-check --disable-gpu \
  --password-store=basic --window-position=0,0 --window-size=1000,700 --app="file://$P/page.html" \
  > "$OUT/chrome.log" 2>&1 &
CHROME_PID=$!
for _ in $(seq 60); do
  W=$(xdotool search --name '^ready$' 2>/dev/null | head -1)
  [ -n "$W" ] && break
  sleep 0.5
done
echo "window ${W:-none}" > "$OUT/steps.txt"
xdotool getwindowgeometry "$W" >> "$OUT/steps.txt" 2>&1
sleep 1
step() { echo "$(date +%s.%N) $*" >> "$OUT/steps.txt"; }
drag() { # name, then the x positions the path visits after the press at x=100
  local name=$1; shift
  step "$name press"
  xdotool mousemove 100 300; sleep 0.2
  xdotool mousedown 1
  for x in 110 130 160 200 260 330 420 470 500; do xdotool mousemove $x 300; sleep 0.03; done
  sleep 0.4
  for x in "$@"; do xdotool mousemove "$x" 300; sleep 0.03; done
  step "$name before release"
  sleep "${HOLD:-0.4}"
  xdotool mouseup 1
  step "$name released"
  sleep 1
  step "$name title $(xdotool getwindowname "$W")"
}
drag A 505 500
drag B 420 360 300
HOLD=0 drag C 420 360 300
sleep 1
exec 7>&-
wait $WATCH
# Chrome is never signalled: the display goes, and Chrome exits on its own once its X connection closes
kill $XTRACE $XVFB 2>/dev/null
for _ in $(seq 30); do [ -d /proc/$CHROME_PID ] || break; sleep 1; done
[ -d /proc/$CHROME_PID ] && echo "chrome still running (pid $CHROME_PID): left alone" >> "$OUT/steps.txt"
rm -rf "$HOME_DIR"
echo done >> "$OUT/steps.txt"
