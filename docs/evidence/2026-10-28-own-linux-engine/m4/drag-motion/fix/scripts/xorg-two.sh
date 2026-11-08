#!/bin/bash
# A private Xorg (dummy driver, no input devices) with two screens laid out side by side, never :0. Prints the
# display; the server runs in the background, its pid in <dir>/xorg.pid.
# usage: xorg-two.sh <dir>
set -u
dir=$1
mkdir -p "$dir"
exec 3> "$dir/display"
/usr/lib/xorg/Xorg -displayfd 3 -config "$HOME/.local/share/cua-171/task66-fix/xorg/two-screens.conf" \
  -logfile "$dir/xorg.log" -noreset -nolisten tcp -sharevts -novtswitch -keeptty -seat seat-cua171fix \
  > "$dir/xorg.out" 2>&1 &
echo $! > "$dir/xorg.pid"
exec 3>&-
for _ in $(seq 50); do
  if [ -s "$dir/display" ]; then break; fi
  sleep 0.2
done
echo ":$(tr -d '\n' < "$dir/display")"
