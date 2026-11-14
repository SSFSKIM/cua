#!/bin/bash
# Task 50: during a step on :0, read only, from outside the guarded tree, every 10 s: the owner's Chrome (pid and start
# time as found before), every window carrying its pid (any and viewable, xdotool search --pid), and each of its
# client windows' WM_CLASS, map state, _NET_WM_STATE and geometry (never a title); every 30 s the well-known names on
# the person's session bus and the person's running user units. Any change from the first reading, or a stall line in
# the run's watchdog file, stops the step: SIGTERM to the pid in <out>/driver.pid (the guard's child, the harness's own
# stop), logged, and <out>/owner-changed made. Ends when <out>/session.done appears.
# usage: owner-watch.sh <out> <owner pid> [watchdog file]
set -u
out=$1; pid=$2; wdog=${3:-}
H=/Users/new
X() { DISPLAY=:0 XAUTHORITY=$H/.Xauthority timeout 5 "$@" 2>&1; }
log="$out/owner-watch.log"
# a count of the owner's windows, or "unread" when xdotool's walk of every window on :0 did not finish in time (a full
# run puts a hundred windows of its own on :0, under load: the first watch read 0 there while the owner's window was
# listed unchanged in the same reading, task 50's stopped run); an unread count is logged, never taken for a change
count() {
  local o rc
  # an X error mid-walk (a window of the run's gone between listing and reading it) ends xdotool with Xlib's 1, the
  # same code as "nothing found": its message on stderr tells them apart
  o=$(DISPLAY=:0 XAUTHORITY=$H/.Xauthority timeout 30 xdotool search "$@" 2>&1); rc=$?
  if [ $rc -eq 124 ] || [ $rc -gt 1 ] || echo "$o" | grep -q 'X Error\|BadWindow\|BadMatch'; then echo "unread(rc $rc)"; else echo "$o" | grep -c '^[0-9]'; fi
}
owner_state() {
  echo "start $(awk '{print $22}' /proc/$pid/stat 2>/dev/null || echo gone)"
  echo "windows-any $(count --pid "$pid")"
  echo "windows-viewable $(count --onlyvisible --pid "$pid")"
  for id in $(X xprop -root _NET_CLIENT_LIST | grep -o '0x[0-9a-f]*'); do
    p=$(X xprop -id "$id" _NET_WM_PID | grep -o '[0-9]*$')
    [ "$p" = "$pid" ] || continue
    echo "client $id $(X xprop -id "$id" WM_CLASS | sed 's/^WM_CLASS(STRING) = //') $(X xprop -id "$id" WM_STATE | grep -o 'window state: .*' | head -1) $(X xprop -id "$id" _NET_WM_STATE | sed 's/^_NET_WM_STATE(ATOM) = //') $(X xdotool getwindowgeometry "$id" | grep -v '^Window' | tr -s ' ' | tr '\n' ' ')"
  done
}
bus_state() {
  busctl --user list --no-pager --no-legend 2>&1 | awk '$1 !~ /^:/ {print "bus", $1, $2}' | sort
  systemctl --user list-units --state=running --no-legend --plain 2>&1 | awk '{print "unit", $1}' | sort
}
stop() {
  echo "$(date -u +%FT%T.%3NZ) CHANGE ($1)" >> "$log"
  touch "$out/owner-changed"
  [ -r "$out/driver.pid" ] && kill -TERM "$(cat "$out/driver.pid")" 2>/dev/null && echo "$(date -u +%FT%T.%3NZ) stop sent to $(cat "$out/driver.pid")" >> "$log"
}
base_owner=$(owner_state); base_bus=$(bus_state)
printf '%s\n' "$(date -u +%FT%T.%3NZ) baseline (owner):" "$base_owner" "baseline (bus): $(echo "$base_bus" | wc -l) lines, digest $(echo "$base_bus" | md5sum | cut -c1-12)" >> "$log"
n=0; changed=0
while [ ! -e "$out/session.done" ]; do
  n=$((n + 1))
  now_owner=$(owner_state)
  cmp_base=$base_owner
  if echo "$now_owner" | grep -q 'unread('; then
    echo "$(date -u +%FT%T.%3NZ) check $n: $(echo "$now_owner" | grep 'unread(' | tr '\n' ' ')" >> "$log"
    # the rest of the reading still counts: only the window counts are set aside
    now_owner=$(echo "$now_owner" | grep -v '^windows-'); cmp_base=$(echo "$base_owner" | grep -v '^windows-')
  fi
  if [ "$now_owner" != "$cmp_base" ] && [ $changed = 0 ]; then
    stop "owner's Chrome or its windows"; changed=1
    diff <(echo "$cmp_base") <(echo "$now_owner") >> "$log"
  fi
  if [ $((n % 3)) -eq 0 ]; then
    now_bus=$(bus_state)
    if [ "$now_bus" != "$base_bus" ] && [ $changed = 0 ]; then
      stop "the person's session bus names or user units"; changed=1
      diff <(echo "$base_bus") <(echo "$now_bus") >> "$log"
    fi
  fi
  if [ -n "$wdog" ] && [ -e "$wdog" ] && grep -q '"stall"\|"lost"' "$wdog" 2>/dev/null && [ $changed = 0 ]; then
    stop "the run's watchdog wrote a stall"; changed=1
  fi
  [ $((n % 30)) -eq 1 ] && echo "$(date -u +%FT%T.%3NZ) check $n same" >> "$log"
  sleep 10
done
echo "$(date -u +%FT%T.%3NZ) done after $n checks; changed=$changed" >> "$log"
