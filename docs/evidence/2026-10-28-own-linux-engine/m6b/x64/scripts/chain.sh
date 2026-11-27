#!/bin/bash
# T8's (task 173) x64 chain, each phase of t8.sh under the host lock. Each phase's status goes to chain.log. A failing
# phase does not stop the next, except the fixture's verification: the fixture steps never run on a fixture that did
# not verify.
set -u
T=/Users/new/.local/share/cua-171/t173
LOCK=/Users/new/.local/share/cua-171/locked.sh
log() { echo "$(date -u +%FT%TZ) $*" >> "$T/chain.log"; }
step() {
  local name=$1 minutes=$2; shift 2
  log "start $name"
  CUA_LOCK_MAX=$((minutes + 5))m "$LOCK" t173 timeout -s TERM -k 60 "${minutes}m" "$@" > "$T/$name.log" 2>&1
  local c=$?; log "end $name exit $c"; return $c
}
fx=1
for s in ${STEPS:-npmci fxverify cells srchome r1 r3d r3c r4 fallback fixture-plain fixture-trace prov}; do
  case "$s" in
    npmci) step npmci 10 bash "$T/t8.sh" npmci ;;
    xprobe) step xprobe 20 bash "$T/t8.sh" xprobe ;;
    cells) step cells 75 bash "$T/t8.sh" cells ;;
    srchome) step srchome 10 bash "$T/t8.sh" srchome ;;
    r1) step r1 55 bash "$T/t8.sh" r1 ;;
    r3d|r3c|r4) step "$s" 15 bash "$T/t8.sh" "$s" ;;
    fallback) step fallback 20 bash "$T/t8.sh" fallback ;;
    fxverify) step fxverify 10 bash "$T/t8.sh" fxverify && fx=0 ;;
    fixture-plain) if [ "$fx" -eq 0 ]; then step fixture-plain 30 env MODE=plain bash "$T/t8.sh" fixture; else log "skip fixture-plain: the fixture did not verify"; fi ;;
    fixture-trace) if [ "$fx" -eq 0 ]; then step fixture-trace 45 env MODE=trace bash "$T/t8.sh" fixture; else log "skip fixture-trace: the fixture did not verify"; fi ;;
    prov) step prov 15 bash "$T/t8.sh" prov ;;
    *) log "unknown step $s" ;;
  esac
done
log "chain done"
