#!/bin/bash
# Task 50: whether a window id named by a finding still exists on :0, and the owner's Chrome window's frame (its
# parent, then the parent's parent up to the root), ids only: xwininfo's lines are cut to the parent's id inside the
# pipe, so no title is printed or kept.
# usage: frame-check.sh <finding window id> <owner window id>
H=/Users/new
X() { DISPLAY=:0 XAUTHORITY=$H/.Xauthority timeout 5 "$@"; }
if X xprop -id "$1" WM_CLASS >/dev/null 2>&1; then echo "$1 exists now"; else echo "$1 does not exist now"; fi
w=$2
for i in 1 2 3; do
  p=$(X xwininfo -id "$w" -tree 2>/dev/null | awk '/Parent window id:/ {print $4}')
  echo "parent of $w: $p"
  [ -z "$p" ] && break
  w=$p
done
echo "root: $(X xwininfo -root 2>/dev/null | awk '/Window id:/ {print $4}')"
