#!/bin/bash
# The live tests that need a private Xorg (live_device.rs), each server on the dummy driver with no input devices:
# - the two-screen tests (`CUA_LIVE_TWO_SCREENS`), on a server whose two screens sit side by side
#   (tests/xorg-two-screens.conf), where a motion on one screen's root carries the pointer across, as on a real
#   multi-screen layout; Xvfb, which the gate's suite runs them on, puts its screens at one origin and does not;
# - the resize test (`CUA_LIVE_RESIZABLE`), on a server whose one screen grows through RandR from 640x480 to 1280x800
#   (tests/xorg-resizable.conf); Xvfb's RandR never grows a screen past the size it started with.
# Each server takes the first free display from :100 up, never :0, and is terminated at the end, its socket and lock
# gone. Exits nonzero when a test fails or does not run.
#
# Needs xserver-xorg-core and xserver-xorg-video-dummy, run as an ordinary user: /usr/lib/xorg/Xorg directly (not the
# Xorg wrapper), on a seat of its own, sharing the VT, with no devices to open.
#
#   cd native/linux-engine && tests/two-screens.sh
set -u
cd "$(dirname "$0")/.."
dir=$(mktemp -d "${TMPDIR:-/tmp}/cua-two-screens.XXXXXX")
servers=()
displays=()
stop() {
  local server display
  for server in "${servers[@]}"; do
    if kill -0 "$server" 2>/dev/null; then
      kill -TERM "$server"
      wait "$server" 2>/dev/null
    fi
  done
  for display in "${displays[@]}"; do
    if [ -e "/tmp/.X11-unix/X$display" ]; then
      echo "two-screens: the server left /tmp/.X11-unix/X$display behind" >&2
      status=1
    fi
  done
  rm -rf "$dir"
}
status=1
trap 'stop; exit $status' EXIT
# Starts a private Xorg with config $1 (its files named $2 in $dir) and sets `display` to its number, or exits.
# The display is the first free one from :100 up, named to the server, never :0: given only -displayfd, Xorg takes the
# lowest free display, which is :0 wherever no X server holds it (GitHub's hosted runner). -displayfd still says when
# the server is ready. A display taken meanwhile by another server makes this one exit at once, and the next is tried.
start_xorg() {
  local config=$1 name=$2 candidate xorg=
  display=
  for candidate in $(seq 100 163); do
    if [ -e "/tmp/.X$candidate-lock" ] || [ -e "/tmp/.X11-unix/X$candidate" ]; then continue; fi
    : > "$dir/$name.display"
    exec 3> "$dir/$name.display"
    /usr/lib/xorg/Xorg ":$candidate" -displayfd 3 -config "$PWD/tests/$config" -logfile "$dir/$name.log" \
      -noreset -nolisten tcp -sharevts -novtswitch -keeptty -seat "seat-cua-$name-$$" > "$dir/$name.out" 2>&1 &
    xorg=$!
    exec 3>&-
    for _ in $(seq 100); do
      if [ -s "$dir/$name.display" ] || ! kill -0 "$xorg" 2>/dev/null; then break; fi
      sleep 0.1
    done
    if [ -s "$dir/$name.display" ] || kill -0 "$xorg" 2>/dev/null; then break; fi
    wait "$xorg" 2>/dev/null
    xorg=
  done
  [ -n "$xorg" ] && servers+=("$xorg")
  display=$(tr -dc '0-9' < "$dir/$name.display")
  if [ -z "$display" ] || [ "$display" = 0 ]; then
    echo "two-screens: no private display for $name (got '${display}'); the server's log:" >&2
    tail -n 20 "$dir/$name.log" >&2
    exit
  fi
  displays+=("$display")
  echo "two-screens: Xorg on :$display ($name)"
}
start_xorg xorg-two-screens.conf two-screens
two=$display
start_xorg xorg-resizable.conf resizable
resizable=$display
out="$dir/test.out"
CUA_LIVE_TWO_SCREENS=":$two" CUA_LIVE_RESIZABLE=":$resizable" \
  dbus-run-session --dbus-daemon="$PWD/tests/dbus-daemon-quiet" -- \
  cargo test --release --locked --target x86_64-unknown-linux-musl --features live --test live_device -- \
  --test-threads 1 --exact \
  a_drag_handle_ended_with_the_pointer_on_another_screen_releases_there_and_moves_nothing \
  an_exit_with_a_drag_handle_held_and_the_pointer_on_another_screen_releases_there_and_moves_nothing \
  a_drag_handle_moved_into_screen_area_added_after_the_engine_started_ends_as_asked \
  > "$out" 2>&1
tested=$?
grep -vE '^\s+(Compiling|Finished|Running|Downloaded|Downloading)\b' "$out"
if [ "$tested" -eq 0 ] && grep -q '^test result: ok\. 3 passed' "$out"; then status=0; fi
