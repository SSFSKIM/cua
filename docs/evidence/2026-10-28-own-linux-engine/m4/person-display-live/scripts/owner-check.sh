#!/bin/bash
# Task 50: the person's side of :0, read only, before and after each step (owner-watch.sh repeats the owner's part
# during it), from task 49's owner-check.sh. Window ids, WM_CLASS, _NET_WM_PID, map and WM states and geometry only,
# never a title (xwininfo's tree is cut to its ids inside the pipe). The owner's Chrome main process (found by its
# command line: /opt/google/chrome/chrome with no --type= and no --user-data-dir), its pid and start time, and every
# window carrying its pid; the well-known names on the person's session bus with their pids (busctl --user list), the
# person's running user units, org.a11y.Status (read only while org.a11y.Bus is already owned, so the read activates
# nothing); :0's X client count (Xorg's accepted connections, from the socket table); the modification times
# (metadata only) of the person's files task 45's list names; the person's runtime directory's names.
# usage: owner-check.sh <label>
set -u
label=$1
H=/Users/new
X() { DISPLAY=:0 XAUTHORITY=$H/.Xauthority timeout 5 "$@" 2>&1; }
echo "== $label $(date -u +%FT%T.%3NZ)"
owner=""
for p in $(pgrep -x chrome); do
  c=$(tr '\0' '\n' < /proc/$p/cmdline 2>/dev/null)
  case "$c" in *--type=*|*--user-data-dir*) continue;; esac
  [ "$(head -1 <<<"$c" | cut -d" " -f1)" = /opt/google/chrome/chrome ] && owner="$owner $p"
done
for p in $owner; do echo "owner chrome pid $p starttime_ticks $(awk '{print $22}' /proc/$p/stat)"; done
[ -z "$owner" ] && echo "owner chrome: NONE FOUND"
n_owner_procs=0
for p in $(pgrep -x chrome); do grep -q -- '--user-data-dir=/tmp/' /proc/$p/cmdline 2>/dev/null || n_owner_procs=$((n_owner_procs + 1)); done
echo "chrome-named processes without a run profile: $n_owner_procs"
echo ":0 active window $(X xprop -root _NET_ACTIVE_WINDOW | grep -o '0x[0-9a-f]*')"
ids=$(X xprop -root _NET_CLIENT_LIST | grep -o '0x[0-9a-f]*')
echo ":0 _NET_CLIENT_LIST count $(echo "$ids" | grep -c .)"
for id in $ids; do
  cls=$(X xprop -id "$id" WM_CLASS | sed 's/^WM_CLASS(STRING) = //')
  pid=$(X xprop -id "$id" _NET_WM_PID | grep -o '[0-9]*$')
  st=$(X xprop -id "$id" WM_STATE | grep -o 'window state: .*' | head -1)
  ns=$(X xprop -id "$id" _NET_WM_STATE | sed 's/^_NET_WM_STATE(ATOM) = //')
  geo=$(X xdotool getwindowgeometry "$id" | grep -v '^Window' | tr -s ' ' | tr '\n' ' ')
  echo ":0 client $id class $cls pid $pid $st netstate $ns $geo"
done
for p in $owner; do
  echo "owner $p windows (any, by _NET_WM_PID) $(X xdotool search --pid "$p" | grep -c '^[0-9]')"
  echo "owner $p windows (viewable) $(X xdotool search --onlyvisible --pid "$p" | grep -c '^[0-9]')"
done
echo ":0 root children $(X xwininfo -root -children | awk '/^ +0x[0-9a-f]+ /{n++} END{print n+0}')"
echo ":0 X client connections (Xorg's accepted sockets) $(ss -xn | awk '($5=="@/tmp/.X11-unix/X0" || $5=="/tmp/.X11-unix/X0") && $2=="ESTAB" {n++} END{print n+0}')"
echo ":0 root AT_SPI_BUS names bus_0: $(X xprop -root AT_SPI_BUS | grep -c 'at-spi/bus_0')"
echo "-- person's session bus, well-known names (name pid process)"
names=$(busctl --user list --no-pager --no-legend 2>&1)
echo "$names" | awk '$1 !~ /^:/ {print "bus", $1, $2, $3}' | sort
if echo "$names" | awk '$1=="org.a11y.Bus" && $2 ~ /^[0-9]+$/ {f=1} END{exit !f}'; then
  for s in IsEnabled ScreenReaderEnabled; do echo "person org.a11y.Status $s $(busctl --user get-property org.a11y.Bus /org/a11y/bus org.a11y.Status $s 2>&1)"; done
else
  echo "person org.a11y.Status: not read (org.a11y.Bus not owned: a read would activate it)"
fi
echo "-- person's running user units"
systemctl --user list-units --state=running --no-legend --plain 2>&1 | awk '{print "unit", $1}' | sort
echo "-- mtimes (metadata only)"
for f in .config/google-chrome .pki .local/share/pki .config/dconf/user .local/share/recently-used.xbel .local/share/applications/mimeapps.list .config/mozilla .mozilla .config/katerc .config/gedit .local/share/gedit .Xauthority .config/kglobalshortcutsrc .local/share/kactivitymanagerd .local/share/gvfs-metadata .local/share/org.gnome.TextEditor .local/share/kate .config/QtProject .config/QtProject.conf .local/share/QtProject .cache/mesa_shader_cache .config/gnome-terminal .config/libreoffice; do
  if [ -e "$H/$f" ]; then echo "mtime ~/$f $(stat -c '%.Y' "$H/$f")"; else echo "mtime ~/$f absent"; fi
done
echo "-- the person's a11y bus socket and runtime directory (names)"
stat -c 'bus_0 inode %i mtime %.Y' /run/user/501/at-spi/bus_0 2>&1
ls /run/user/501/at-spi/ 2>&1 | sed 's/^/at-spi dir: /'
ls -A /run/user/501/ 2>&1 | sed 's/^/runtime dir: /'
echo "-- X sockets"
ls -A /tmp/.X11-unix/ | sed 's/^/x socket: /'
