#!/bin/bash
# Which X11 properties each family's top-level window carries (names only), on a private Xvfb with Openbox: whether
# Qt's xcb backend leaves a mark an engine can read without /proc (task 61 fix, ruling B's production gap).
# usage: props.sh <out file>
set -u
out=$1
here=$(cd "$(dirname "$0")" && pwd)
quiet=$HOME/.local/share/cua-171/task61fix/checkout/native/linux-engine/tests/dbus-daemon-quiet
: > "$out"
apps=(
  "pyqt5|python3 $here/native-control.py cua171-props qt5"
  "pyqt6|python3 $here/native-control.py cua171-props qt6"
  "kate|kate"
  "keditbookmarks|keditbookmarks"
  "qtcreator|qtcreator"
  "designer|/usr/lib/qt6/bin/designer"
  "gtk3|python3 $here/front.py"
  "gtk4|python3 $here/gtk-modal.py cua171-props gtk4"
  "gedit|gedit --standalone"
  "gnome-text-editor|gnome-text-editor --standalone"
  "xterm|xterm"
  "firefox|firefox --no-remote --profile PROFILE"
  "chrome|google-chrome --user-data-dir=PROFILE --no-first-run --no-default-browser-check --password-store=basic"
  "writer|soffice --writer --norestore"
  "gnome-terminal|gnome-terminal"
)
for entry in "${apps[@]}"; do
  label=${entry%%|*} cmd=${entry#*|}
  scratch=$(mktemp -d /tmp/cua171-props-XXXXXX)
  mkdir -p "$scratch"/{config,data,cache,state,profile}
  cmd=${cmd//PROFILE/$scratch/profile}
  HOME=$scratch XDG_CONFIG_HOME=$scratch/config XDG_DATA_HOME=$scratch/data XDG_CACHE_HOME=$scratch/cache \
    XDG_STATE_HOME=$scratch/state GSETTINGS_BACKEND=memory GDK_BACKEND=x11 QT_QPA_PLATFORM=xcb \
    timeout 120 xvfb-run -a -s '-screen 0 1280x800x24' dbus-run-session --dbus-daemon="$quiet" -- bash -c '
      openbox --sm-disable >/dev/null 2>&1 &
      sleep 1
      setsid $2 >/dev/null 2>&1 &
      for _ in $(seq 60); do
        ids=$(xprop -root _NET_CLIENT_LIST | grep -o "0x[0-9a-f]*")
        [ -n "$ids" ] && break; sleep 0.5
      done
      sleep 6
      for w in $(xprop -root _NET_CLIENT_LIST | grep -o "0x[0-9a-f]*"); do
        names=$(xprop -id $w -notype | grep -o "^[A-Z_][A-Za-z0-9_]*" | sort -u | tr "\n" " ")
        xembed=$(xprop -id $w _XEMBED_INFO | tr -d "\n")
        echo "$1 $w: $names | $xembed"
      done
      pkill -P $$ ; sleep 0.5; kill %1 2>/dev/null; true' _ "$label" "$cmd" >> "$out" 2>&1
  rm -rf "$scratch"
done
cat "$out"
