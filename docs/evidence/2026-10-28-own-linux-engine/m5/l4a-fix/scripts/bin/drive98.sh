#!/bin/bash
# Task 98 (from task 96's drive.sh): one development run of a drop-signals plan on this task's own checkout and its
# development engine build, on a private display, under the host lock (holder m5-l4a), capped at 45 minutes. Before
# it: hold-sittings absent, no stress-ng, a quiet host (1-minute load below 1.0, waited for up to 15 minutes).
# usage: drive98.sh <run name> <plan> idle|load2 [engine binary] [extra harness args...]
#   (out: ~/.local/share/cua-171/task98/out/<run name>; log: out/driver.log)
set -u
D=/Users/new/.local/share/cua-171
T=$D/task98
G=${T98_CHECKOUT:-/Users/new/Developer/GitHub/cua/.claude/worktrees/t98-l4a}
NAME=$1; PLAN=$2; LOAD=$3; shift 3
BIN=${1:-$G/native/linux-engine/target/release/cua-engine}; [ $# -gt 0 ] && shift
OUT=$T/out
[ -x "$D/node24/bin/node" ] && export PATH=$D/node24/bin:$PATH
mkdir -p "$OUT"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$OUT/driver.log"; }
[ -e "$D/hold-sittings" ] && { log "hold-sittings present: $NAME not started"; exit 5; }
while pgrep -x stress-ng > /dev/null; do log "stress-ng running: waiting before $NAME"; sleep 30; done
for i in $(seq 1 90); do
  l=$(cut -d' ' -f1 /proc/loadavg)
  awk -v l="$l" 'BEGIN{exit !(l < 1.0)}' && break
  sleep 10
done
[ -e "$D/hold-sittings" ] && { log "hold-sittings appeared: $NAME not started"; exit 5; }
LOADARGS=(); [ "$LOAD" = load2 ] && LOADARGS=(--load-factor 2)
log "start $NAME plan=$PLAN load=$LOAD engine=$BIN ($("$BIN" --version)) loadavg=$(cut -d' ' -f1-3 /proc/loadavg)"
"$D/locked.sh" m5-l4a timeout -s TERM -k 120 45m node "$T/bin/t98-run.mjs" "$G" "$OUT/$NAME" "$NAME" \
  --experiment drop-signals --family "${T98_FAMILY:-electron}" --plan "$PLAN" "${LOADARGS[@]}" --cua "$BIN" "$@" > "$OUT/$NAME.driver.out" 2>&1
code=$?
[ "$code" -eq 124 ] && log "TIMEOUT $NAME: past 45 min, stopped"
log "end $NAME exit $code loadavg=$(cut -d' ' -f1-3 /proc/loadavg) $(tail -1 "$OUT/$NAME.driver.out" | cut -c1-200)"
exit $code
