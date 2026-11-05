#!/bin/bash
# Ruling A's measurement: the modal-dialog probe on Qt 5, Qt 6, GTK 3 and GTK 4, without and with a window manager, each
# on its own private Xvfb and session bus (never :0), every application in a scratch home.
# usage: modal-probe.sh <engine> <out file>
set -u
engine=$1 out=$2
here=$(cd "$(dirname "$0")" && pwd)
ck=$HOME/.local/share/cua-171/task61fix/checkout
xprobe=$ck/scripts/linux-engine-diff/xprobe/target/release/xprobe
qtmodal=$ck/docs/evidence/2026-10-28-own-linux-engine/m4/qt-activation/scripts/qt-modal.py
quiet=$ck/native/linux-engine/tests/dbus-daemon-quiet
: > "$out"
for wm in ${WMS:-none openbox}; do
  for family in ${FAMILIES:-qt5 qt6 gtk3 gtk4 chrome}; do
    case $family in
      kate|qtcreator) fixture=(python3 "$here/app-modal.py" "$family") ;;
      qt5|qt6) fixture=(python3 "$qtmodal" "cua171-modal-$family" "$family") ;;
      chrome) fixture=(python3 "$here/chrome-modal.py" "cua171-modal-chrome-$$" "$engine") ;;
      *) fixture=(python3 "$here/gtk-modal.py" "cua171-modal-$family" "$family") ;;
    esac
    scratch=$(mktemp -d /tmp/cua171-modal-XXXXXX)
    mkdir -p "$scratch"/{config,data,cache,state}
    HOME=$scratch XDG_CONFIG_HOME=$scratch/config XDG_DATA_HOME=$scratch/data XDG_CACHE_HOME=$scratch/cache \
      XDG_STATE_HOME=$scratch/state GSETTINGS_BACKEND=memory GDK_BACKEND=x11 QT_QPA_PLATFORM=xcb \
      QT_LINUX_ACCESSIBILITY_ALWAYS_ON=1 QT_ACCESSIBILITY=1 NO_AT_BRIDGE=0 \
      timeout 300 xvfb-run -a -s '-screen 0 1280x800x24' dbus-run-session --dbus-daemon="$quiet" -- bash -c '
        if [ "$1" = openbox ]; then openbox --sm-disable >/dev/null 2>&1 & sleep 1; fi
        python3 "$2" "$3" "$4" "$1" "${@:5}"
        kill %1 2>/dev/null; true' _ "$wm" "$here/modal-probe.py" "$engine" "$xprobe" "$family" "${fixture[@]}" >> "$out" 2>&1
    rm -rf "$scratch"
  done
done
grep -E 'moved off|no probe button|Traceback|Error' "$out"
