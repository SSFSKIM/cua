#!/usr/bin/env bash
# A private Xvfb :97 and its own session bus for menu-probe-inner.sh; the owner's display is not touched.
set -u
OUT="$HOME/.local/share/cua-171/task39/menu-probe-out"
rm -rf "$OUT"; mkdir -p "$OUT"
Xvfb :97 -screen 0 1280x800x24 -nolisten tcp >"$OUT/xvfb.log" 2>&1 &
XV=$!
sleep 1
dbus-run-session -- bash "$HOME/.local/share/cua-171/task39/menu-probe-inner.sh" "$1" "$OUT"
kill "$XV"; wait "$XV" 2>/dev/null
cat "$OUT/log.txt"
