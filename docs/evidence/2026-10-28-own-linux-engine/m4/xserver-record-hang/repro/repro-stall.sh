#!/usr/bin/env bash
# #171 task 41: try to make a private Xvfb spin under the whole-run RECORD, never :0. A private Xvfb, a RECORD client
# (xprobe record-run, $REC, default the e54658b8 build), flood clients and connection churn as load, and the record
# client paused (SIGSTOP) and resumed at random so its socket fills and the server buffers its output, as a lagging
# reader does. A GetInputFocus prober on its own connection; when a round trip goes unanswered for 5 s the server's
# stack is sampled with gdb and everything stops.
# $1: out directory; $2: seconds; env: D (display, default :93), REC, FLOODS (4), BATCH (50), CHURN (20/s),
# KEEP (1: on a spin, rehearse-close.sh before stopping), SHORT (1: pauses and runs of 10-90 ms, else 200-900 ms runs and 0-490 ms pauses), PAUSE (1 = pause the record client; 0 = leave it running), FLOODARGS ("pause_ms big_every big_bytes", "0 0 0").
set -u
T=/Users/new/.local/share/cua-171/task41
OUT="${1:?out}"; SECS="${2:?seconds}"
D="${D:-:93}"; REC="${REC:-$T/xprobe-e54658b8}"; FLOODS="${FLOODS:-4}"; BATCH="${BATCH:-50}"; CHURN="${CHURN:-20}"
PAUSE="${PAUSE:-1}"; FLOODARGS="${FLOODARGS:-0 0 0}"
FLOOD="$T/flood/target/release/task41-flood"
mkdir -p "$OUT"
pids=()
cleanup() {
  [ -n "${rec:-}" ] && kill -CONT "$rec" 2>/dev/null
  kill "${pids[@]}" 2>/dev/null; pkill -P $$ sleep 2>/dev/null
  [ -n "${xvfb:-}" ] && kill -KILL "$xvfb" 2>/dev/null
  wait 2>/dev/null
  rm -rf "$(dirname "$AUTH")"
}
trap cleanup EXIT
AUTH=$(mktemp -d)/Xauthority
xauth -q -f "$AUTH" add "$D" . "$(mcookie)"
export XAUTHORITY="$AUTH" DISPLAY="$D"
Xvfb "$D" -screen 0 1280x800x24 -nolisten tcp -auth "$AUTH" >"$OUT/xvfb.log" 2>&1 & xvfb=$!
for _ in $(seq 50); do "$FLOOD" ping 10 1000 >/dev/null 2>&1 & p=$!; sleep 0.1; kill $p 2>/dev/null && break; done
if [ "${GDBX:-0}" = 1 ]; then
  sudo -n env DEBUGINFOD_URLS=https://debuginfod.ubuntu.com timeout $((SECS + 120)) gdb -iex "set debuginfod enabled on" -p "$xvfb" -batch -nx -x "$T/gdb-abort.cmd" >"$OUT/gdb.log" 2>&1 & pids+=($!)
  for _ in $(seq 600); do grep -q "Continuing" "$OUT/gdb.log" 2>/dev/null && break; sleep 0.2; done
fi
echo "xvfb $xvfb on $D; rec $REC ($(sha256sum "$REC" | cut -c1-12)); floods $FLOODS batch $BATCH churn $CHURN pause $PAUSE flood-args $FLOODARGS; secs $SECS" | tee "$OUT/run.txt"
(exec sleep 1000000) | "$REC" record-run --ours $$ --exe task41-flood >"$OUT/record.jsonl" 2>"$OUT/record.err" & rec=$!; pids+=($rec)
for _ in $(seq 100); do grep -q '"kind":"ready"' "$OUT/record.jsonl" && break; sleep 0.1; done
grep -q '"kind":"ready"' "$OUT/record.jsonl" || { echo "record did not begin"; exit 2; }
"$FLOOD" ping 1000 5000 >"$OUT/ping.log" 2>&1 & ping=$!; pids+=($ping)
for i in $(seq "$FLOODS"); do "$FLOOD" flood "$((SECS - 5))" "$i" "$BATCH" $FLOODARGS >"$OUT/flood-$i.json" 2>&1 & pids+=($!); echo $! >>"$OUT/load.pids"; done
"$FLOOD" churn "$((SECS - 5))" "$CHURN" >"$OUT/churn.json" 2>&1 & pids+=($!); echo $! >>"$OUT/load.pids"
start=$(date +%s); cycles=0; result=clean
while [ $(( $(date +%s) - start )) -lt "$SECS" ]; do
  if ! kill -0 "$ping" 2>/dev/null; then result=stall; break; fi
  if ! kill -0 "$rec" 2>/dev/null; then result=record-ended; break; fi
  if [ "$PAUSE" = 1 ]; then
    if [ "${SHORT:-0}" = 1 ]; then sleep "0.0$(( RANDOM % 9 + 1 ))"; else sleep "0.$(( RANDOM % 8 + 2 ))"; fi
    kill -STOP "$rec"; if [ "${SHORT:-0}" = 1 ]; then sleep "0.0$(( RANDOM % 9 + 1 ))"; else sleep "0.$(( RANDOM % 5 ))$(( RANDOM % 10 ))"; fi
    [ $(( cycles % 50 )) = 0 ] && sudo -n ss -xp 2>/dev/null | grep "pid=$rec," | awk '{print $3, $4}' | tr '\n' ' ' | sed "s/^/cycle $cycles $(date +%T) recvq,sendq: /" >>"$OUT/queues.log" && echo >>"$OUT/queues.log"
    kill -CONT "$rec"
  else
    sleep 1
  fi
  cycles=$((cycles + 1))
  [ $(( cycles % 20 )) = 0 ] && echo "$(date +%T) cycle $cycles xvfb $(ps -o %cpu=,rss= -p "$xvfb")" >>"$OUT/progress.log"
done
echo "result: $result after $(( $(date +%s) - start )) s, $cycles cycles" | tee -a "$OUT/run.txt"
if [ "$result" = clean ]; then
  # the load has ended: let the record catch up (its file still for 3 s, at most 180 s) before it is judged
  kill -CONT "$rec"; last=-1; still=0
  for _ in $(seq 180); do
    size=$(stat -c %s "$OUT/record.jsonl"); [ "$size" = "$last" ] && still=$((still + 1)) || still=0; last=$size
    [ "$still" -ge 3 ] && break; sleep 1
  done
  echo "record settled at $size bytes; xvfb $(ps -o %cpu=,rss= -p "$xvfb")" | tee -a "$OUT/run.txt"
fi
if [ "$result" = record-ended ]; then
  echo "xvfb alive: $(kill -0 "$xvfb" 2>/dev/null && echo yes || echo no) $(ps -o %cpu=,rss= -p "$xvfb"); answers: $(timeout 5 xprop -root _NET_SUPPORTED >/dev/null 2>&1 && echo yes || echo no)" | tee -a "$OUT/run.txt"
  tail -2 "$OUT/record.jsonl" | cut -c1-200 | tee -a "$OUT/run.txt"
fi
if [ "$result" = stall ]; then
  cat "$OUT/ping.log" | tail -3 | tee -a "$OUT/run.txt"
  echo "xvfb: $(ps -o %cpu=,rss= -p "$xvfb")" | tee -a "$OUT/run.txt"
  sudo -n ls -l /proc/$xvfb/fd >"$OUT/xvfb-fds.txt" 2>&1
  sudo -n ss -xp >"$OUT/ss.txt" 2>&1
  for i in 1 2 3; do
    sudo -n timeout 60 env DEBUGINFOD_URLS=https://debuginfod.ubuntu.com gdb -iex "set debuginfod enabled on" -p "$xvfb" -batch -nx -ex "set pagination off" -ex "bt 8" -ex "frame 2" -ex "info locals" -ex "p oc->output" -ex "p *oco" -ex "p who->index" -ex "p who->clientAsMask" 2>/dev/null | grep -vE "^\[New|^\[Thread|^warning|^Download" >>"$OUT/xvfb-stack.txt"
    echo --- >>"$OUT/xvfb-stack.txt"; sleep 1
  done
  head -40 "$OUT/xvfb-stack.txt"
  # KEEP=1: rehearse the owner's recovery (close the spinning descriptor inside the server) before anything stops
  [ "${KEEP:-0}" = 1 ] && "$T/rehearse-close.sh" "$OUT" "$xvfb" "$rec"
fi
kill -CONT "$rec" 2>/dev/null
