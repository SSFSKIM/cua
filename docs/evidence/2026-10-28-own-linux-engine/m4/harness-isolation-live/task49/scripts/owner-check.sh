#!/bin/bash
# Task 49: the person's side, read only, before and after a session (owner-watch.sh repeats the first part during it).
# The owner's Chrome main process (found by its command line: /opt/google/chrome/chrome with no --type= and no
# --user-data-dir), its pid and start time; :0's client list (xprop -root _NET_CLIENT_LIST) and each window's
# WM_CLASS, never a title; the well-known names on the person's session bus with their pids (busctl --user list) and
# the person's running user services; and the modification times (metadata only) of the person's files task 45's list
# names.
# usage: owner-check.sh <label>
set -u
label=$1
H=/Users/new
echo "== $label $(date -u +%FT%T.%3NZ)"
owner=""
for p in $(pgrep -x chrome); do
  c=$(tr '\0' '\n' < /proc/$p/cmdline 2>/dev/null)
  case "$c" in *--type=*|*--user-data-dir*) continue;; esac
  [ "$(head -1 <<<"$c" | cut -d" " -f1)" = /opt/google/chrome/chrome ] && owner="$owner $p"
done
for p in $owner; do echo "owner chrome pid $p starttime_ticks $(awk '{print $22}' /proc/$p/stat)"; done
[ -z "$owner" ] && echo "owner chrome: NONE FOUND"
echo "chrome-named processes: $(pgrep -c -x chrome)"
list=$(DISPLAY=:0 XAUTHORITY=$H/.Xauthority timeout 5 xprop -root _NET_CLIENT_LIST 2>&1)
ids=$(echo "$list" | grep -o '0x[0-9a-f]*')
echo ":0 _NET_CLIENT_LIST count $(echo "$ids" | grep -c .)"
for id in $ids; do DISPLAY=:0 XAUTHORITY=$H/.Xauthority timeout 5 xprop -id "$id" WM_CLASS 2>&1 | sed 's/^WM_CLASS(STRING) = //'; done | sort | uniq -c | sed 's/^/:0 WM_CLASS /'
echo "-- person's session bus, well-known names (name pid process)"
busctl --user list --no-pager --no-legend 2>&1 | awk '$1 !~ /^:/ {print "bus", $1, $2, $3}' | sort
echo "-- person's running user services"
systemctl --user list-units --type=service --state=running --no-legend --plain 2>&1 | awk '{print "unit", $1}' | sort
echo "-- mtimes (metadata only)"
for f in .config/google-chrome .pki .local/share/pki .config/dconf/user .local/share/recently-used.xbel .local/share/applications/mimeapps.list .config/mozilla .mozilla .config/katerc .config/gedit .local/share/gedit .Xauthority .config/kglobalshortcutsrc .local/share/kactivitymanagerd .local/share/gvfs-metadata .local/share/org.gnome.TextEditor .local/share/kate; do
  if [ -e "$H/$f" ]; then echo "mtime ~/$f $(stat -c '%.Y' "$H/$f")"; else echo "mtime ~/$f absent"; fi
done
echo "-- the person's a11y bus socket"
stat -c 'bus_0 inode %i mtime %.Y' /run/user/501/at-spi/bus_0 2>&1
ls /run/user/501/at-spi/ 2>&1 | sed 's/^/at-spi dir: /'
echo "-- X sockets"
ls /tmp/.X11-unix/ | sed 's/^/x socket: /'
