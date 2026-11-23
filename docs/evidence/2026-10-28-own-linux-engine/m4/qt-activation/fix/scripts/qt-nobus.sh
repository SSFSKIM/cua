#!/bin/bash
# Does the late Qt fixture register its tree on a fresh session bus when started with no accessibility switch? (For the
# live test of ruling B: a Qt window with no frame to wait on.) Inside: xvfb-run -a dbus-run-session -- qt-nobus.sh <engine>
set -u
engine=$1
fixture=$HOME/.local/share/cua-171/task61fix/checkout/native/linux-engine/tests/support/qt-late.py
for binding in qt5 qt6; do
  env -u QT_LINUX_ACCESSIBILITY_ALWAYS_ON -u QT_ACCESSIBILITY python3 "$fixture" "cua171-nobus-$binding" "$binding" 0 1000 > /tmp/cua171-nobus.$$ 2>/dev/null &
  app=$!
  for _ in $(seq 50); do [ -s /tmp/cua171-nobus.$$ ] && break; sleep 0.1; done
  xid=$(head -1 /tmp/cua171-nobus.$$ | python3 -c 'import json,sys; print(json.loads(sys.stdin.readline())["xid"])')
  sleep 3
  for i in 1 2 3; do
    printf '{"id":1,"command":"get_window_state","input":{"window":{"id":%s},"include_screenshot":false}}\n' "$xid" \
      | "$engine" server 2>/dev/null | python3 -c 'import json,sys; a=json.loads(sys.stdin.readline()); print(a["ok"], (a.get("output") or {}).get("ax_tree_source"), a.get("error"))'
    sleep 1
  done | sed "s/^/$binding: /"
  kill $app; wait $app 2>/dev/null
done
rm -f /tmp/cua171-nobus.$$
