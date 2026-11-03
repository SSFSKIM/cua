#!/usr/bin/env bash
# #171 task 41: rehearse the owner's recovery option 1 on a private Xvfb that spins (never :0). Called by
# repro-stall.sh (KEEP=1) once its server spins and has been sampled. Mirrors :0's state first (the record client
# killed, its peer closed), then closes the spinning descriptor inside the server through gdb, and reports: the
# server's CPU, whether the display answers, whether the other clients are still connected and answering, and whether
# the server stays up for 2 minutes. $1: run directory; $2: the server's pid; $3: the record client's pid.
# DISPLAY is the private display's. It refuses a display not marked private, and a server process that is not an
# Xvfb (task 44: gdb never attaches to a person's Xorg).
set -u
OUT="$1"; XVFB="$2"; REC="$3"
HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=private-x.sh
. "$HERE/private-x.sh"
require_private
[ "$(cat "/proc/$XVFB/comm" 2>/dev/null)" = Xvfb ] || { echo "refusing pid $XVFB: not an Xvfb" >&2; exit 2; }
R="$OUT/rehearsal.txt"
cpu() { # the server's CPU over 3 s, in percent of one core
  local a b; a=$(awk '{print $14 + $15}' "/proc/$XVFB/stat"); sleep 3; b=$(awk '{print $14 + $15}' "/proc/$XVFB/stat")
  echo $(( (b - a) * 100 / 3 / $(getconf CLK_TCK) ))
}
answers() { timeout 5 xdpyinfo >/dev/null 2>&1 && echo yes || echo no; }
fd=$(grep -m1 -oE '__GI___writev \(fd=[0-9]+' "$OUT/xvfb-stack.txt" | grep -oE '[0-9]+$')
echo "spinning descriptor: fd $fd (from the stall's stack)" | tee "$R"
echo "before: cpu ${cpu:-}$(cpu)% answers $(answers)" | tee -a "$R"
flood_windows=$(timeout 5 xwininfo -root -children 2>/dev/null | grep -c '10x10' || true)
kill -KILL "$REC" 2>/dev/null; sleep 1
echo "record client killed (as on :0); peer of fd $fd now: $(sudo -n ss -xp 2>/dev/null | grep "Xvfb\",pid=$XVFB,fd=$fd)" | awk '{print $8}')" | tee -a "$R"
echo "after the kill, before the close: cpu $(cpu)% answers $(answers)" | tee -a "$R"
echo "close: $(sudo -n gdb -p "$XVFB" -batch -nx -ex "call (int)close($fd)" 2>&1 | grep -E '^\$' )" | tee -a "$R"
sleep 1
echo "after the close: cpu $(cpu)% answers $(answers)" | tee -a "$R"
echo "clients the server lists: $(timeout 5 xlsclients -a 2>/dev/null | wc -l); flood windows (10x10 root children) before $flood_windows, now $(timeout 5 xwininfo -root -children 2>/dev/null | grep -c '10x10')" | tee -a "$R"
w=$(timeout 5 xwininfo -root -children 2>/dev/null | grep '10x10' | head -1 | awk '{print $1}')
echo "a flood window's property: $(timeout 5 xprop -id "$w" TASK41_FLOOD 2>&1 | cut -c1-80)" | tee -a "$R"
for p in $(cat "$OUT/load.pids" 2>/dev/null); do echo "load pid $p: $(kill -0 "$p" 2>/dev/null && echo alive || echo gone)"; done | tee -a "$R"
for i in $(seq 12); do
  sleep 10
  echo "+$((i * 10)) s: up $(kill -0 "$XVFB" 2>/dev/null && echo yes || echo no) cpu $(cpu)% answers $(answers)" | tee -a "$R"
done
echo "server log after the close (last lines):" | tee -a "$R"
tail -5 "$OUT/xvfb.log" | grep -vE 'Could not resolve keysym|xkbcomp|^> ' | tee -a "$R"
