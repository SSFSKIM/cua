#!/usr/bin/env bash
# #171 task 41: xprobe's RECORD refusal and watchdog, live on Xvfbs of the script's own only (private-x.sh; never :0).
# 1. record-run on an unmarked display: refused. 2. marked private: it records. 3. the watchdog on an answering
# display: ready, then end when stdin closes. 4. a frozen server (the Xvfb SIGSTOPped): the watchdog kills the guarded
# process first, stops the run, alerts naming the display, exits 3. 5. the real spin (the reproduction's load, the
# record client paused at random): the watchdog, guarding the record client, catches it.
# $1: the xprobe binary; $2: out directory; env FLOOD: the flood build (default repro/flood's).
set -u
X="${1:?xprobe}"; OUT="${2:?out}"
HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=private-x.sh
. "$HERE/private-x.sh"
FLOOD="${FLOOD:-$HERE/flood/target/release/task41-flood}"
mkdir -p "$OUT"
pids=()
cleanup() { for p in "${pids[@]}"; do kill -CONT "$p" 2>/dev/null; kill -KILL "$p" 2>/dev/null; done; wait 2>/dev/null; }
trap cleanup EXIT
echo "xprobe $(sha256sum "$X" | cut -c1-12)" | tee "$OUT/live.txt"

# the script's own server, unmarked for case 1
start_own_x; xvfb=$OWN_XVFB; pids+=($xvfb)
echo "== 1. record-run on an unmarked display (its own, $DISPLAY)" | tee -a "$OUT/live.txt"
(sleep 2) | timeout 10 "$X" record-run --ours $$ >"$OUT/1.jsonl" 2>"$OUT/1.err"; echo "exit $?" | tee -a "$OUT/live.txt"
cat "$OUT/1.err" | tee -a "$OUT/live.txt"
echo "== 2. marked private" | tee -a "$OUT/live.txt"
mark_private
(sleep 2) | timeout 10 "$X" record-run --ours $$ >"$OUT/2.jsonl" 2>"$OUT/2.err"; echo "exit $? kinds: $(grep -o '"kind":"[a-z]*"' "$OUT/2.jsonl" | sort | uniq -c | tr '\n' ' ')" | tee -a "$OUT/live.txt"
echo "== 3. the watchdog on an answering display" | tee -a "$OUT/live.txt"
(sleep 3) | "$X" watchdog --display "$DISPLAY" --interval-ms 500 --bound-ms 2000 >"$OUT/3.jsonl" 2>"$OUT/3.err"; echo "exit $?" | tee -a "$OUT/live.txt"
cat "$OUT/3.jsonl" "$OUT/3.err" | tee -a "$OUT/live.txt"
echo "== 4. a frozen server (Xvfb stopped)" | tee -a "$OUT/live.txt"
sleep 60 & guarded=$!; pids+=($guarded)
sleep 60 & run=$!; pids+=($run)
coproc WD { "$X" watchdog --display "$DISPLAY" --interval-ms 500 --bound-ms 2000 --grace-ms 1000 --stop "$run" >"$OUT/4.jsonl" 2>"$OUT/4.err"; echo "exit $?" >"$OUT/4.exit"; }
echo "guard $guarded" >&"${WD[1]}"
sleep 1.5
kill -STOP "$xvfb"; stopped_at=$(date +%s%3N)
for _ in $(seq 100); do [ -s "$OUT/4.exit" ] && break; sleep 0.1; done
echo "caught after $(( $(date +%s%3N) - stopped_at )) ms; $(cat "$OUT/4.exit" 2>/dev/null); guarded $(kill -0 "$guarded" 2>/dev/null && echo alive || echo gone); run $(kill -0 "$run" 2>/dev/null && echo alive || echo gone)" | tee -a "$OUT/live.txt"
cat "$OUT/4.jsonl" "$OUT/4.err" | tee -a "$OUT/live.txt"
kill -CONT "$xvfb"; kill "$xvfb"

echo "== 5. the real spin, watched" | tee -a "$OUT/live.txt"
start_own_x; xvfb=$OWN_XVFB; pids+=($xvfb)
mark_private
(exec sleep 100000) | "$X" record-run --ours $$ --exe task41-flood >"$OUT/5-record.jsonl" 2>"$OUT/5-record.err" & rec=$!; pids+=($rec)
for _ in $(seq 100); do grep -q '"kind":"ready"' "$OUT/5-record.jsonl" && break; sleep 0.1; done
sleep 1000 & run=$!; pids+=($run)
coproc WD5 { "$X" watchdog --display "$DISPLAY" --interval-ms 2000 --bound-ms 5000 --grace-ms 2000 --stop "$run" >"$OUT/5.jsonl" 2>"$OUT/5.err"; echo "exit $?" >"$OUT/5.exit"; }
echo "guard $rec" >&"${WD5[1]}"
for i in 1 2; do "$FLOOD" flood 900 "$i" 30 5 5 200000 >/dev/null 2>&1 & pids+=($!); done
"$FLOOD" churn 900 20 >/dev/null 2>&1 & pids+=($!)
start=$(date +%s)
while [ ! -s "$OUT/5.exit" ] && [ $(( $(date +%s) - start )) -lt 900 ]; do
  sleep "0.0$(( RANDOM % 9 + 1 ))"; kill -STOP "$rec" 2>/dev/null; sleep "0.0$(( RANDOM % 9 + 1 ))"; kill -CONT "$rec" 2>/dev/null
done
echo "after $(( $(date +%s) - start )) s: $(cat "$OUT/5.exit" 2>/dev/null || echo 'no stall'); record client $(kill -0 "$rec" 2>/dev/null && echo alive || echo gone); run $(kill -0 "$run" 2>/dev/null && echo alive || echo gone); server cpu $(ps -o %cpu= -p "$xvfb")" | tee -a "$OUT/live.txt"
cat "$OUT/5.jsonl" "$OUT/5.err" | tee -a "$OUT/live.txt"
if [ -s "$OUT/5.exit" ]; then
  sudo -n timeout 60 gdb -p "$xvfb" -batch -nx -ex "bt 4" 2>/dev/null | grep -E "^#" | head -4 | tee -a "$OUT/live.txt"
fi
