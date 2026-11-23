#!/bin/bash
# Task 123: what libxdo's "XGetWindowProperty[_NET_ACTIVE_WINDOW] failed (code=1)" means, on a private display of its
# own (Xvfb :97 with Openbox, never :0): with no window active, _NET_ACTIVE_WINDOW reads None, and `xdotool
# getactivewindow` prints exactly that line; then with a window active it prints the id and nothing on stderr.
# Run under the host lock.
set -u
export DISPLAY=:97
unset XAUTHORITY
Xvfb :97 -screen 0 800x600x24 -nolisten tcp > /dev/null 2>&1 &
X=$!
sleep 1
openbox > /dev/null 2>&1 &
W=$!
sleep 1
echo "xdotool $(xdotool version 2>&1 | head -1)"
echo "--- no window active: getactivewindow"
xdotool getactivewindow; echo "exit $?"
xterm -T t123-xdo-check > /dev/null 2>&1 &
T=$!
sleep 1.5
id=$(xdotool search --name t123-xdo-check | head -1)
echo "--- windowactivate --sync to the harness's own window"
xdotool windowactivate --sync "$id"; echo "exit $?"
echo "--- a window active: getactivewindow (stderr shown)"
xdotool getactivewindow > /dev/null; echo "exit $?"
kill $T $W $X 2>/dev/null
wait 2>/dev/null
echo done
