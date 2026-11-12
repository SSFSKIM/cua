#!/bin/bash
# The two-screen live tests (live_device.rs, `CUA_LIVE_TWO_SCREENS`) on a private Xorg whose two screens sit side by
# side (tests/xorg-two-screens.conf: the dummy driver, no input devices), where a motion on one screen's root carries
# the pointer across, as on a real multi-screen layout; Xvfb, which the gate's suite runs them on, puts its screens at
# one origin and does not. The server takes the first free display from :100 up, never :0, and is terminated at the
# end, its socket and lock gone. Exits nonzero when a test fails or does not run.
#
# Needs xserver-xorg-core and xserver-xorg-video-dummy, run as an ordinary user: /usr/lib/xorg/Xorg directly (not the
# Xorg wrapper), on a seat of its own, sharing the VT, with no devices to open.
#
#   cd native/linux-engine && tests/two-screens.sh
set -u
cd "$(dirname "$0")/.."
dir=$(mktemp -d "${TMPDIR:-/tmp}/cua-two-screens.XXXXXX")
xorg=
display=
stop() {
  if [ -n "$xorg" ] && kill -0 "$xorg" 2>/dev/null; then
    kill -TERM "$xorg"
    wait "$xorg" 2>/dev/null
  fi
  if [ -n "$display" ] && [ -e "/tmp/.X11-unix/X$display" ]; then
    echo "two-screens: the server left /tmp/.X11-unix/X$display behind" >&2
    status=1
  fi
  rm -rf "$dir"
}
status=1
trap 'stop; exit $status' EXIT
# The display is the first free one from :100 up, named to the server, never :0: given only -displayfd, Xorg takes the
# lowest free display, which is :0 wherever no X server holds it (GitHub's hosted runner). -displayfd still says when
# the server is ready. A display taken meanwhile by another server makes this one exit at once, and the next is tried.
for candidate in $(seq 100 163); do
  if [ -e "/tmp/.X$candidate-lock" ] || [ -e "/tmp/.X11-unix/X$candidate" ]; then continue; fi
  : > "$dir/display"
  exec 3> "$dir/display"
  /usr/lib/xorg/Xorg ":$candidate" -displayfd 3 -config "$PWD/tests/xorg-two-screens.conf" -logfile "$dir/xorg.log" \
    -noreset -nolisten tcp -sharevts -novtswitch -keeptty -seat "seat-cua-two-screens-$$" > "$dir/xorg.out" 2>&1 &
  xorg=$!
  exec 3>&-
  for _ in $(seq 100); do
    if [ -s "$dir/display" ] || ! kill -0 "$xorg" 2>/dev/null; then break; fi
    sleep 0.1
  done
  if [ -s "$dir/display" ] || kill -0 "$xorg" 2>/dev/null; then break; fi
  wait "$xorg" 2>/dev/null
  xorg=
done
display=$(tr -dc '0-9' < "$dir/display")
if [ -z "$display" ] || [ "$display" = 0 ]; then
  echo "two-screens: no private display (got '${display}'); the server's log:" >&2
  tail -n 20 "$dir/xorg.log" >&2
  display=
  exit
fi
echo "two-screens: Xorg on :$display"
out="$dir/test.out"
CUA_LIVE_TWO_SCREENS=":$display" dbus-run-session --dbus-daemon="$PWD/tests/dbus-daemon-quiet" -- \
  cargo test --release --locked --target x86_64-unknown-linux-musl --features live --test live_device -- \
  --test-threads 1 --exact \
  a_drag_handle_ended_with_the_pointer_on_another_screen_releases_there_and_moves_nothing \
  an_exit_with_a_drag_handle_held_and_the_pointer_on_another_screen_releases_there_and_moves_nothing \
  > "$out" 2>&1
tested=$?
grep -vE '^\s+(Compiling|Finished|Running|Downloaded|Downloading)\b' "$out"
if [ "$tested" -eq 0 ] && grep -q '^test result: ok\. 2 passed' "$out"; then status=0; fi
