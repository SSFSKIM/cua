#!/bin/bash
# Qt's xcb platform plugin and the GUI kernel at the versions kate (5.15.13) and qtcreator (6.4.2) run on this VM.
cd "$HOME/.local/share/cua-171/task61/qt-src" || exit 1
host=raw.githubusercontent.com
base="https://$host/qt/qtbase"
for v in 5.15.13 6.4.2; do
  for f in src/plugins/platforms/xcb/qxcbwindow.cpp src/plugins/platforms/xcb/qxcbconnection.cpp \
    src/plugins/platforms/xcb/qxcbeventdispatcher.cpp src/plugins/platforms/xcb/qxcbeventqueue.cpp \
    src/gui/kernel/qguiapplication.cpp src/gui/kernel/qwindowsysteminterface.cpp; do
    mkdir -p "$v/$(dirname "$f")"
    curl -sfL "$base/v$v/$f" -o "$v/$f" || echo "miss $v $f"
  done
done
ls -la */src/plugins/platforms/xcb/
