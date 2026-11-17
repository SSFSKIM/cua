#!/bin/bash
# A modal dialog that maps while a request runs: opener-probe.py on Qt 5 and Qt 6, without and with Openbox, each on
# its own private Xvfb and session bus (never :0), in a scratch home.
# usage: opener-probe.sh <engine> <out file>
set -u
engine=$1 out=$2
here=$(cd "$(dirname "$0")" && pwd)
quiet=$HOME/.local/share/cua-171/task61fix/checkout/native/linux-engine/tests/dbus-daemon-quiet
: > "$out"
for wm in none openbox; do
  for binding in qt5 qt6; do
    scratch=$(mktemp -d /tmp/cua171-opener-XXXXXX)
    mkdir -p "$scratch"/{config,data,cache,state}
    HOME=$scratch XDG_CONFIG_HOME=$scratch/config XDG_DATA_HOME=$scratch/data XDG_CACHE_HOME=$scratch/cache \
      XDG_STATE_HOME=$scratch/state GSETTINGS_BACKEND=memory GDK_BACKEND=x11 QT_QPA_PLATFORM=xcb \
      QT_LINUX_ACCESSIBILITY_ALWAYS_ON=1 \
      timeout 300 xvfb-run -a -s '-screen 0 1280x800x24' dbus-run-session --dbus-daemon="$quiet" -- bash -c '
        if [ "$1" = openbox ]; then openbox --sm-disable >/dev/null 2>&1 & sleep 1; fi
        python3 "$2" "$3" "$1" "$4"
        kill %1 2>/dev/null; true' _ "$wm" "$here/opener-probe.py" "$engine" "$binding" >> "$out" 2>&1
    rm -rf "$scratch"
  done
done
grep -E 'times$|Traceback' "$out"
