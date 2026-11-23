#!/usr/bin/env bash
# #171 task 41: try to make a private Xvfb spin under the whole-run RECORD, never :0. A private Xvfb of the script's
# own (private-x.sh: -displayfd, so its display is the server's choice; marked CUA171_PRIVATE_DISPLAY, and the script
# stops if the server does not start or the mark does not read back), a RECORD client ($REC, default the harness's
# xprobe record-run, which itself refuses an unmarked display), flood clients and connection churn as load (flood
# refuses an unmarked display too), and the record client paused (SIGSTOP) and resumed at random so its socket fills
# and the server buffers its output, as a lagging reader does. A GetInputFocus prober on its own connection; when a
# round trip goes unanswered for 5 s the server's stack is sampled with gdb and everything stops.
# $1: out directory; $2: seconds; env: REC, FLOOD (the flood build, default repro/flood's), FLOODS (4), BATCH (50),
# CHURN (20/s), KEEP (1: on a spin, rehearse-close.sh before stopping), SHORT (1: pauses and runs of 10-90 ms, else
# 200-900 ms runs and 0-490 ms pauses), PAUSE (1 = pause the record client; 0 = leave it running), FLOODARGS
# ("pause_ms big_every big_bytes", "0 0 0"), GDBX (1: gdb attached from the start, with $T/gdb-abort.cmd).
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/../../../../../.." && pwd)
T=/Users/new/.local/share/cua-171/task41
# shellcheck source=private-x.sh
. "$HERE/private-x.sh"
OUT="${1:?out}"; SECS="${2:?seconds}"
REC="${REC:-$ROOT/scripts/linux-engine-diff/xprobe/target/release/xprobe}"; FLOODS="${FLOODS:-4}"; BATCH="${BATCH:-50}"; CHURN="${CHURN:-20}"
PAUSE="${PAUSE:-1}"; FLOODARGS="${FLOODARGS:-0 0 0}"
FLOOD="${FLOOD:-$HERE/flood/target/release/task41-flood}"
[ -x "$FLOOD" ] || { echo "build the load first: cargo build --release --offline --manifest-path $HERE/flood/Cargo.toml" >&2; exit 2; }
[ -x "$REC" ] || { echo "no record client at $REC" >&2; exit 2; }
mkdir -p "$OUT"
pids=()
cleanup() {
  [ -n "${rec:-}" ] && kill -CONT "$rec" 2>/dev/null
  kill "${pids[@]}" 2>/dev/null; pkill -P $$ sleep 2>/dev/null
  [ -n "${xvfb:-}" ] && kill -KILL "$xvfb" 2>/dev/null
  wait 2>/dev/null
}
trap cleanup EXIT
# the script's own server, or nothing: DISPLAY is set only once it named its display, and marked before any load
start_own_x "$OUT/xvfb.log"; xvfb=$OWN_XVFB
mark_private
if [ "${GDBX:-0}" = 1 ]; then
  sudo -n env DEBUGINFOD_URLS=https://debuginfod.ubuntu.com timeout $((SECS + 120)) gdb -iex "set debuginfod enabled on" -p "$xvfb" -batch -nx -x "$T/gdb-abort.cmd" >"$OUT/gdb.log" 2>&1 & pids+=($!)
  for _ in $(seq 600); do grep -q "Continuing" "$OUT/gdb.log" 2>/dev/null && break; sleep 0.2; done
fi
echo "xvfb $xvfb on $DISPLAY (its own, marked private); rec $REC ($(sha256sum "$REC" | cut -c1-12)); floods $FLOODS batch $BATCH churn $CHURN pause $PAUSE flood-args $FLOODARGS; secs $SECS" | tee "$OUT/run.txt"
(exec sleep 1000000) | "$REC" record-run --ours $$ --exe task41-flood >"$OUT/record.jsonl" 2>"$OUT/record.err" & rec=$!; pids+=($rec)
for _ in $(seq 100); do grep -q '"kind":"ready"' "$OUT/record.jsonl" && break; sleep 0.1; done
grep -q '"kind":"ready"' "$OUT/record.jsonl" || { echo "record did not begin: $(cat "$OUT/record.err")"; exit 2; }
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
  [ "${KEEP:-0}" = 1 ] && "$HERE/rehearse-close.sh" "$OUT" "$xvfb" "$rec"
fi
kill -CONT "$rec" 2>/dev/null
