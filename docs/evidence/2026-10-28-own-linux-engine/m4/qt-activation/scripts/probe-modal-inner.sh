#!/bin/bash
# Inside a private Xvfb with no window manager and a session bus (probe-modal.sh): does a background key to a Qt main
# window that a modal dialog blocks move the X input focus to the dialog? 5 keys per binding, the front window given
# the focus back before each.
# usage: probe-modal-inner.sh <engine> <xprobe> <qt-modal.py>
set -u
engine=$1 xprobe=$2 script=$3
export QT_LINUX_ACCESSIBILITY_ALWAYS_ON=1
sleep 600 | "$xprobe" record 900 600 100 100 focus > /tmp/cua171-modal-front.$$ &
front_pid=$!
sleep 1
front=$(head -1 /tmp/cua171-modal-front.$$ | python3 -c 'import json,sys; print(json.loads(sys.stdin.readline())["window"])')
for binding in qt5 qt6; do
  python3 "$script" "cua171-modal-$binding" "$binding" > /tmp/cua171-modal-app.$$ 2>/dev/null &
  app=$!
  for _ in $(seq 50); do [ -s /tmp/cua171-modal-app.$$ ] && break; sleep 0.1; done
  ids=$(head -1 /tmp/cua171-modal-app.$$)
  main=$(echo "$ids" | python3 -c 'import json,sys; print(json.loads(sys.stdin.readline())["main"])')
  dialog=$(echo "$ids" | python3 -c 'import json,sys; print(json.loads(sys.stdin.readline())["dialog"])')
  # the control: the front window given the focus and nothing sent, the focus read 0.6 s later
  for i in 1 2 3; do
    xdotool windowfocus --sync "$front"
    sleep 0.6
    echo "$binding control $i: no key, focus $(xdotool getwindowfocus) (front $front)"
  done
  moved=0
  for i in 1 2 3 4 5; do
    xdotool windowfocus --sync "$front"
    sleep 0.3
    echo "$binding key $i: focus before $(xdotool getwindowfocus)"
    printf '{"id":1,"command":"press_key","input":{"window":{"id":%s},"key":"a"}}\n' "$main" | timeout 20 "$engine" server > /tmp/cua171-modal-answer.$$ 2>/dev/null
    sleep 0.3
    focus=$(xdotool getwindowfocus)
    [ "$focus" = "$dialog" ] && moved=$((moved + 1))
    echo "$binding key $i: answer $(head -c 120 /tmp/cua171-modal-answer.$$) focus $focus (front $front, main $main, dialog $dialog)"
  done
  echo "$binding: the dialog took the X focus after $moved of 5 background keys to the blocked main window"
  kill "$app"; wait "$app" 2>/dev/null
done
pkill -P $$ sleep; wait "$front_pid" 2>/dev/null
rm -f /tmp/cua171-modal-front.$$ /tmp/cua171-modal-app.$$ /tmp/cua171-modal-answer.$$
