#!/bin/bash
# P1 1's measurement: across the Qt applications installed on the VM, how much of each one's windows a background
# press reaches as a native child. Each application on its own private Xvfb, Openbox and session bus (never :0), in a
# scratch home; its visible top-level windows measured 8 s after the first maps (a first-run dialog included).
# usage: native-children.sh <out file>
set -u
out=$1
here=$(cd "$(dirname "$0")" && pwd)
quiet=$HOME/.local/share/cua-171/task61fix/checkout/native/linux-engine/tests/dbus-daemon-quiet
: > "$out"
apps=(
  "kate|kate"
  "keditbookmarks|keditbookmarks"
  "qtcreator|qtcreator"
  "assistant|/usr/lib/qt6/bin/assistant"
  "designer|/usr/lib/qt6/bin/designer"
  "linguist|/usr/lib/qt6/bin/linguist"
  "pixeltool|/usr/lib/qt6/bin/pixeltool"
  "qdbusviewer|/usr/lib/qt6/bin/qdbusviewer"
  "control-qt5|python3 $here/native-control.py cua171-native-control qt5"
  "control-qt6|python3 $here/native-control.py cua171-native-control qt6"
)
for entry in "${apps[@]}"; do
  label=${entry%%|*} cmd=${entry#*|}
  scratch=$(mktemp -d /tmp/cua171-native-XXXXXX)
  mkdir -p "$scratch"/{config,data,cache,state}
  HOME=$scratch XDG_CONFIG_HOME=$scratch/config XDG_DATA_HOME=$scratch/data XDG_CACHE_HOME=$scratch/cache \
    XDG_STATE_HOME=$scratch/state GSETTINGS_BACKEND=memory QT_QPA_PLATFORM=xcb \
    timeout 120 xvfb-run -a -s '-screen 0 1280x800x24' dbus-run-session --dbus-daemon="$quiet" -- bash -c '
      openbox --sm-disable >/dev/null 2>&1 &
      sleep 1
      $2 >/dev/null 2>&1 &
      app=$!
      # the client windows the window manager lists (an application that re-executes itself has another pid)
      for _ in $(seq 60); do ids=$(xprop -root _NET_CLIENT_LIST | grep -o "0x[0-9a-f]*"); [ -n "$ids" ] && break; sleep 0.5; done
      sleep 8
      ids=$(xprop -root _NET_CLIENT_LIST | grep -o "0x[0-9a-f]*")
      for w in $ids; do
        echo "{\"app\": \"$1\", \"result\": $(python3 "$3" "$w")}"
      done
      [ -z "$ids" ] && echo "{\"app\": \"$1\", \"result\": null}"
      kill $app 2>/dev/null; sleep 0.5; kill -9 $app 2>/dev/null; kill %1 2>/dev/null; true' _ "$label" "$cmd" "$here/native-children.py" >> "$out" 2>&1
  rm -rf "$scratch"
done
python3 -c '
import json, sys
for line in open(sys.argv[1]):
    try: r = json.loads(line)
    except ValueError: continue
    res = r["result"]
    if not res: print(r["app"], "no window"); continue
    kids = [d for d in res["descendants"] if d["viewable"]]
    print(f"{r[\"app\"]}: window {res[\"window\"]} {res[\"size\"]}: {res[\"on_native_child\"]} of {res[\"points\"]} points on a native child ({res[\"share\"]:.1%}); {len(kids)} viewable descendants {[(d[\"width\"], d[\"height\"], d[\"depth\"]) for d in kids][:8]}")
' "$out"
