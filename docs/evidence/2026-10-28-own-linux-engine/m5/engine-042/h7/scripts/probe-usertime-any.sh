#!/bin/bash
# task 125: does Chrome's browser mark a press it read with _NET_WM_USER_TIME, visible to another client (xprop -spy),
# for a synthetic (SendEvent) press as for an XTEST one? A private display, a run-owned profile; development probe.
# Task 128 (the review of cf1ef10f, finding 4): the X server is the probe's own, started as the harness starts its
# private servers (xtools.mjs `startPrivateServer`: Xvfb -displayfd, so the server names its own free display, never a
# guessed one), and no input is sent until the display it wrote is known and its server is still the probe's child.
# Every process the probe starts is stopped on any exit. Each click is bracketed by this machine's monotonic clock in
# ms (the clock drop-signals.mjs `serverNow` reads), so the mark's value shows the X server's clock against it.
set -u
T=${T:-/Users/new/.local/share/cua-171/task128/probe}
mkdir -p "$T"
prof=$(mktemp -d "$T/prof.XXXXXX")
fd=$(mktemp "$T/displayfd.XXXXXX")
pids=()
cleanup() {
  local i
  for ((i = ${#pids[@]} - 1; i >= 0; i--)); do kill "${pids[i]}" 2>/dev/null; done
  wait 2>/dev/null
  # the browser's own children (not this shell's) leave the profile last
  for i in $(seq 1 50); do pgrep -f -- "--user-data-dir=$prof" > /dev/null || break; sleep 0.1; done
  rm -rf "$prof" "$fd"
}
trap cleanup EXIT
trap 'exit 1' INT TERM
mono() { node -e 'console.log(Number(process.hrtime.bigint() / 1000000n))'; }
Xvfb -displayfd 3 -noreset -screen 0 1280x800x24 -nolisten tcp 3> "$fd" > "$T/xvfb.log" 2>&1 & xv=$!
pids+=("$xv")
n=
for i in $(seq 1 100); do
  n=$(tr -dc 0-9 < "$fd")
  [ -n "$n" ] && break
  kill -0 "$xv" 2>/dev/null || { echo "Xvfb exited before naming its display"; exit 1; }
  sleep 0.1
done
[ -n "$n" ] || { echo "Xvfb named no display"; exit 1; }
[ "$n" = 0 ] && { echo "refusing :0"; exit 1; }
kill -0 "$xv" 2>/dev/null || { echo "Xvfb is gone"; exit 1; }
export DISPLAY=:$n XAUTHORITY=$T/no-xauthority
echo "display :$n, its server the probe's own Xvfb (pid $xv, -displayfd)"
openbox > /dev/null 2>&1 & pids+=("$!")
"${CHROME:-google-chrome}" --user-data-dir="$prof" --no-first-run --no-default-browser-check --disable-gpu --new-window 'data:text/html,<p>probe</p>' > "$T/chrome.log" 2>&1 & pids+=("$!")
w=
for i in $(seq 1 100); do w=$(xdotool search --class Google-chrome 2>/dev/null | tail -1); [ -n "$w" ] && xprop -id "$w" WM_NAME | grep -q probe && break; sleep 0.2; done
echo "window $w"
xprop -id "$w" _NET_WM_USER_TIME _NET_WM_USER_TIME_WINDOW
utw=$(xprop -id "$w" _NET_WM_USER_TIME_WINDOW | grep -o '0x[0-9a-f]*')
spyon=${utw:-$w}
echo "spying on $spyon"
stdbuf -oL xprop -spy -id "$spyon" _NET_WM_USER_TIME > "$T/spy.txt" 2>&1 & pids+=("$!")
sleep 1
xdotool mousemove --window "$w" 200 200
sleep 0.5
a=$(mono); xdotool click 1; b=$(mono); echo "xtest click between monotonic $a and $b ms"; sleep 1
a=$(mono); xdotool click --window "$w" 1; b=$(mono); echo "synthetic click between monotonic $a and $b ms"; sleep 1
echo "--- spy"; cat "$T/spy.txt"
