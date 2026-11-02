#!/usr/bin/env bash
# How long `xdotool windowminimize` (without --sync) takes on :0, on a harness gedit; and xprobe minimize for scale.
# A harness window gets the focus first, so the WM's fallback never lands on the owner's Chrome.
set -u
export DISPLAY=:0 XAUTHORITY="$HOME/.Xauthority"
XPROBE=/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/scripts/linux-engine-diff/xprobe/target/release/xprobe
DIR="$(mktemp -d /tmp/cua171-xdomin-XXXXXX)"
win_of() {
  local pid="$1" w p
  for _ in $(seq 1 100); do
    for w in $(xprop -root _NET_CLIENT_LIST | sed 's/.*# //; s/,//g'); do
      p="$(xprop -id "$w" _NET_WM_PID 2>/dev/null | sed 's/.*= //')"
      if [ "$p" = "$pid" ]; then echo $((w)); return; fi
    done
    sleep 0.1
  done
}
printf 'front\n' > "$DIR/front.txt"; printf 'target\n' > "$DIR/target.txt"
gedit --standalone "$DIR/front.txt" >/dev/null 2>&1 & FPID=$!
gedit --standalone "$DIR/target.txt" >/dev/null 2>&1 & TPID=$!
FWIN="$(win_of $FPID)"; TWIN="$(win_of $TPID)"
sleep 1
xdotool windowactivate --sync "$FWIN"; xdotool windowactivate --sync "$TWIN"
echo "front $FWIN target $TWIN active before: $(xprop -root _NET_ACTIVE_WINDOW | sed 's/.*# //')"
START=$(date +%s%N); timeout 30 xdotool windowminimize "$TWIN"; RC=$?; END=$(date +%s%N)
echo "xdotool windowminimize: exit $RC in $(( (END-START)/1000000 )) ms; state $(xprop -id "$TWIN" WM_STATE | sed -n 's/.*window state: //p'); active $(xprop -root _NET_ACTIVE_WINDOW | sed 's/.*# //')"
xdotool windowactivate --sync "$TWIN" 2>/dev/null || true
sleep 0.3
xdotool windowactivate --sync "$FWIN"; xdotool windowactivate --sync "$TWIN"
"$XPROBE" minimize "$TWIN"
echo "xprobe: active after $(xprop -root _NET_ACTIVE_WINDOW | sed 's/.*# //')"
"$XPROBE" close "$TWIN"; "$XPROBE" close "$FWIN"
sleep 0.5
kill "$FPID" "$TPID" 2>/dev/null; wait 2>/dev/null
rm -rf "$DIR"
echo "active at end: $(xprop -root _NET_ACTIVE_WINDOW | sed 's/.*# //')"
