#!/bin/bash
# Task 122 (from task 109): privacy-scan.mjs over the given evidence dirs, with the titles of :0's windows (every _NET_CLIENT_LIST
# client: here only the stand-in session's Chrome; the harness's are gone) read live from the VM and piped straight in,
# never written to disk or printed. Counts only.
# usage: privacy-run.sh <dir>...
set -u
ssh cua-171-arm64 'export DISPLAY=:0 XAUTHORITY=$HOME/.Xauthority; for i in $(xprop -root _NET_CLIENT_LIST | grep -o "0x[0-9a-f]*"); do xprop -id $i _NET_WM_NAME WM_NAME WM_ICON_NAME | sed -n "s/^[A-Z_]*([A-Z_0-9]*) = \"\(.*\)\"$/\1/p"; done' \
  | node /Users/new/.local/share/cua-171/task122/privacy-scan.mjs "$@"
