#!/usr/bin/env bash
# C22 (T4): does activate_window work on a minimized (iconic) window, or does its pipelined SetInputFocus meet BadMatch?
# A harness-owned gedit window on :0, minimized through xprobe, then each engine's activate_window over the wire.
# $1: the engine binary. Prints the engine's answers and the window's state after; no titles or text of other windows.
set -u
ENGINE="${1:?engine}"
export DISPLAY=:0 XAUTHORITY="$HOME/.Xauthority"
XPROBE=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/scripts/linux-engine-diff/xprobe/target/release/xprobe
DIR="$(mktemp -d /tmp/cua171-c22-XXXXXX)"
FILE="$DIR/c22-$$.txt"
printf 'c22 probe\n' > "$FILE"
gedit --standalone "$FILE" > "$DIR/gedit.log" 2>&1 &
GPID=$!
WIN=""
for _ in $(seq 1 100); do
  for w in $(xprop -root _NET_CLIENT_LIST | sed 's/.*# //; s/,//g'); do
    p="$(xprop -id "$w" _NET_WM_PID 2>/dev/null | sed 's/.*= //')"
    if [ "$p" = "$GPID" ]; then WIN=$((w)); fi
  done
  [ -n "$WIN" ] && break
  sleep 0.1
done
echo "gedit pid $GPID window $WIN"
sleep 1
state() {
  echo "-- $1: map_state $(xwininfo -id "$WIN" | sed -n 's/.*Map State: //p'), WM_STATE $(xprop -id "$WIN" WM_STATE | sed -n 's/.*window state: //p'), active $(xprop -root _NET_ACTIVE_WINDOW | sed 's/.*# //'), focus $(xdpyinfo 2>/dev/null | head -0; true)"
}
state before
"$XPROBE" minimize "$WIN"
state minimized
sleep 0.3
printf '%s\n' \
  "{\"id\":1,\"command\":\"list_windows\",\"input\":{}}" \
  "{\"id\":2,\"command\":\"activate_window\",\"input\":{\"window\":{\"id\":$WIN}}}" \
  | "$ENGINE" server 2>/dev/null | node -e '
let n=0; require("readline").createInterface({input:process.stdin}).on("line",l=>{const r=JSON.parse(l);
if(r.id===1){const w=(r.output||[]).find(w=>w.id==='"$WIN"'); console.log("list_windows: target listed:", !!w, w?JSON.stringify({minimized:w.minimized,width:w.width,height:w.height,focused:w.focused}):"");}
else console.log("activate_window:", JSON.stringify({ok:r.ok,error:r.error}));});'
for t in 0.05 0.2 0.5; do sleep "$t"; state "after activate +${t}s"; done
"$XPROBE" close "$WIN"
sleep 0.5
kill "$GPID" 2>/dev/null
wait "$GPID" 2>/dev/null
rm -rf "$DIR"
echo done
