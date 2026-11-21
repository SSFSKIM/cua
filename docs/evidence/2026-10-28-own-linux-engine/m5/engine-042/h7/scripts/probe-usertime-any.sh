#!/bin/bash
# task 125: does Chrome's browser mark a press it read with _NET_WM_USER_TIME, visible to another client (xprop -spy),
# for a synthetic (SendEvent) press as for an XTEST one? A private display, a run-owned profile; development probe.
set -u
D=:78
T=/Users/new/.local/share/cua-171/task125
prof=$(mktemp -d "$T/prof.XXXXXX")
Xvfb $D -screen 0 1280x800x24 -nolisten tcp > "$T/xvfb.log" 2>&1 & xv=$!
sleep 1
export DISPLAY=$D
openbox > /dev/null 2>&1 & wm=$!
"${CHROME:-google-chrome}" --user-data-dir="$prof" --no-first-run --no-default-browser-check --disable-gpu --new-window 'data:text/html,<p>probe</p>' > "$T/chrome.log" 2>&1 & ch=$!
for i in $(seq 1 100); do w=$(xdotool search --class Google-chrome 2>/dev/null | tail -1); [ -n "$w" ] && xprop -id "$w" WM_NAME | grep -q probe && break; sleep 0.2; done
echo "window $w"
xprop -id "$w" _NET_WM_USER_TIME _NET_WM_USER_TIME_WINDOW
utw=$(xprop -id "$w" _NET_WM_USER_TIME_WINDOW | grep -o '0x[0-9a-f]*')
spyon=${utw:-$w}
echo "spying on $spyon"
stdbuf -oL xprop -spy -id "$spyon" _NET_WM_USER_TIME > "$T/spy.txt" 2>&1 & spy=$!
sleep 1
xdotool mousemove --window "$w" 200 200
sleep 0.5
echo "xtest click at $(date +%s.%N)"; xdotool click 1; sleep 1
echo "synthetic click at $(date +%s.%N)"; xdotool click --window "$w" 1; sleep 1
kill $spy; echo "--- spy"; cat "$T/spy.txt"
kill $ch; sleep 1; kill $wm $xv
rm -rf "$prof"
