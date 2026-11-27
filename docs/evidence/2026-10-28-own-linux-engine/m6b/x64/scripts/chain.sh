#!/bin/bash
# T8's (task 173) x64 chain, each phase of t8.sh under the host lock. Each phase's status goes to chain.log, and its
# output to <phase>.log. A failing phase does not stop the next, except two: the fixture steps never run on a fixture
# that did not verify, and the regression and fixture phases never run without the harness's X client (xprobe), which
# private-desktop's watchdog and the gate's steps need. The chain exits nonzero when any phase failed, was skipped or
# was unknown, naming them on its last line.
# Fix wave 1: xprobe joined the default sequence and the exit status. The counted run (chain.log.txt) ran the earlier
# version, whose default lacked xprobe; its rerun named xprobe in STEPS.
set -u
T=/Users/new/.local/share/cua-171/t173
LOCK=/Users/new/.local/share/cua-171/locked.sh
log() { echo "$(date -u +%FT%TZ) $*" >> "$T/chain.log"; }
failed=()
step() {
  local name=$1 minutes=$2; shift 2
  log "start $name"
  CUA_LOCK_MAX=$((minutes + 5))m "$LOCK" t173 timeout -s TERM -k 60 "${minutes}m" "$@" > "$T/$name.log" 2>&1
  local c=$?; log "end $name exit $c"
  [ "$c" -eq 0 ] || failed+=("$name")
  return $c
}
skip() { log "skip $1: $2"; failed+=("$1"); }
fx=1
# the X client is checked by its file, so a chain that names no xprobe phase still runs on one built before it
xprobe_built() { [ -x "$(cd "$T/wt" && pwd -P)/scripts/linux-engine-diff/xprobe/target/release/xprobe" ]; }
for s in ${STEPS:-npmci xprobe fxverify cells srchome r1 r3d r3c r4 fallback fixture-plain fixture-trace prov}; do
  case "$s" in
    npmci) step npmci 10 bash "$T/t8.sh" npmci ;;
    xprobe) step xprobe 20 bash "$T/t8.sh" xprobe ;;
    cells) step cells 75 bash "$T/t8.sh" cells ;;
    srchome) step srchome 10 bash "$T/t8.sh" srchome ;;
    r1|r3d|r3c|r4|fallback)
      if ! xprobe_built; then skip "$s" "the harness's X client is not built"
      elif [ "$s" = r1 ]; then step r1 55 bash "$T/t8.sh" r1
      elif [ "$s" = fallback ]; then step fallback 20 bash "$T/t8.sh" fallback
      else step "$s" 15 bash "$T/t8.sh" "$s"; fi ;;
    fxverify) step fxverify 10 bash "$T/t8.sh" fxverify && fx=0 ;;
    fixture-plain|fixture-trace)
      mode=${s#fixture-}; minutes=30; [ "$mode" = trace ] && minutes=45
      if [ "$fx" -ne 0 ]; then skip "$s" "the fixture did not verify"
      elif ! xprobe_built; then skip "$s" "the harness's X client is not built"
      else step "$s" "$minutes" env MODE="$mode" bash "$T/t8.sh" fixture; fi ;;
    prov) step prov 15 bash "$T/t8.sh" prov ;;
    *) log "unknown step $s"; failed+=("$s") ;;
  esac
done
if [ "${#failed[@]}" -eq 0 ]; then log "chain done: every phase passed"; exit 0; fi
log "chain done: failed or not run: ${failed[*]}"
exit 1
