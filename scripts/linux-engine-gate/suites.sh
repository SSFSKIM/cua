#!/bin/bash
# The gate's facade suites (#171 M4's T18, made one runner by M5's T1), each part on a private desktop (M4's
# private-desktop.mjs), never the person's `:0`. One orchestration, its cua lanes on the engine ENGINE names:
#   ENGINE=installed  the pinned release: no part passes --engine-bin or sets CUA_LINUX_ENGINE_BIN; every cua lane runs
#                     the engine its own home's `cua install` placed at the checkout's pin, and each home is checked by
#                     the pinned rule (gate.mjs check --pinned, candidate.mjs) before its suite runs
#   ENGINE=candidate  a candidate build, ENGINE_BIN, named to every cua lane (--engine-bin, CUA_LINUX_ENGINE_BIN), as
#                     M4's facade.sh ran it (docs/evidence/…/m4/facade/scripts/, kept as M4's record; no step runs it)
# The parts:
#   parity    repl-parity's native suite on both engine lanes, prepared --native-only (installed: its prepared home
#             checked), and the diff against scripts/repl-parity/expected/native-linux.json; a final cleanup that fails
#             fails the part                                                                     (--session)
#   baseline  native-baseline, three runs a lane interleaved, summaries and compare --engines (--session); installed:
#             each cua run checks its own home by the pinned rule before any session (native-baseline --pinned-check).
#             When the comparison names series only a top-up can decide (TOP-UP NEEDED), one top-up: three more runs a
#             lane under $OUT/baseline-topup/, and compare --engines with it, whose verdict is the part's (the gate's R2,
#             the design session, 2026-11-13). A series reported UNPROVED under a declared gap (F8a) is logged and
#             listed in $OUT/baseline/unproved.txt, which the step's record carries (gate.mjs)
#   accept    scripts/accept/linux-native.mjs, CUA_NATIVE_ENGINE=cua, in a home of the run's (installed: checked), under
#             the 50 ms sampler, whose record is judged (engine-watch.mjs)                       (--session)
#   device    scripts/accept/linux-device-mode.mjs, the same way                                  (--session)
# Environment: ENGINE (installed or candidate), ENGINE_BIN (candidate only), OUT (the evidence directory), LOGS (the log
# directory), LABEL (pilot or counted; a counted run refuses a dirty tree and any home the pinned rule refuses), DEVICE
# (the declared Linux device the lanes run on). CUA_LINUX_ENGINE_BIN is refused in the environment either way.
# usage: suites.sh <part>      Run each part under the host lock (locked.sh), one at a time; gate.mjs runs R1-R4 so.
set -u
WT=$(cd "$(dirname "$0")/../.." && pwd)
FACADE=$WT/docs/evidence/2026-10-28-own-linux-engine/m4/facade/scripts
: "${OUT:?}" "${LOGS:?}" "${LABEL:?}" "${DEVICE:?}" "${ENGINE:?}"
if [ -n "${CUA_LINUX_ENGINE_BIN:-}" ]; then echo "CUA_LINUX_ENGINE_BIN is set ($CUA_LINUX_ENGINE_BIN): the runner names the engine itself, or none; unset it" >&2; exit 2; fi
# what the cua lanes are given: nothing on the installed engine, the candidate on a candidate
lane_engine=()
fixture_engine=()
baseline_check=()
case "$ENGINE" in
  installed) [ -z "${ENGINE_BIN:-}" ] || { echo "ENGINE=installed takes no ENGINE_BIN" >&2; exit 2; }; baseline_check=(--pinned-check) ;;
  candidate) [ -n "${ENGINE_BIN:-}" ] || { echo "ENGINE=candidate needs ENGINE_BIN" >&2; exit 2; }; lane_engine=(--engine-bin "$ENGINE_BIN"); fixture_engine=(CUA_LINUX_ENGINE_BIN="$ENGINE_BIN") ;;
  *) echo "ENGINE is installed or candidate, not $ENGINE" >&2; exit 2 ;;
esac
cd "$WT" || exit 2
part=$1
case "$part" in
  parity|baseline|accept|device|inner-parity|inner-baseline|inner-accept|inner-device) ;;
  *) echo "unknown part $part" >&2; exit 2 ;;
esac
node -e "import('$WT/scripts/repl-parity/devices.mjs').then(({declaredDevice}) => { if (declaredDevice(process.argv[1]).platform !== 'linux') throw new Error('not a Linux device'); })" "$DEVICE" \
  || { echo "DEVICE=$DEVICE is not a Linux device scripts/repl-parity/devices.mjs declares" >&2; exit 2; }
SHA=$(git rev-parse HEAD)
DIRTY=$(git status --porcelain | grep -v "^?? node_modules$")  # the node_modules symlink is the checkout's own
if [ "$LABEL" = counted ] && [ -n "$DIRTY" ]; then echo "a counted run needs a clean tree" >&2; exit 2; fi
P=${part#inner-}
mkdir -p "$OUT/$P" "$LOGS/$P"
L=$LOGS/$P
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$L/suites.log"; }

# installed: the pinned rule on the engine of the cua home $1, its record into $2. gh's sign-in is the caller's, so the
# check runs under the HOME (and XDG_CONFIG_HOME) this runner started with, never a run home's. A counted part stops on
# a refusal; a pilot logs it and runs on (a development run refuses nothing). A candidate is checked by gate.mjs.
REAL_HOME=$HOME
REAL_XDG=${XDG_CONFIG_HOME-}
pinned_check() {
  [ "$ENGINE" = installed ] || return 0
  local config
  if [ -n "$REAL_XDG" ]; then config=(XDG_CONFIG_HOME="$REAL_XDG"); else config=(-u XDG_CONFIG_HOME); fi
  env "${config[@]}" HOME="$REAL_HOME" node "$WT/scripts/linux-engine-gate/gate.mjs" check --pinned "$1" > "$2" 2>&1
  local c=$?
  log "pinned check of $1: exit $c, $(head -1 "$2")"
  [ "$c" -eq 0 ] || [ "$LABEL" != counted ]
}

# the run-owned home of the acceptance fixtures: HOME and the XDG directories, an empty secret store, a cua home with the
# release install, whose engine the fixture's session runs (installed) or which the candidate replaces (candidate)
run_home() {
  R=$LOGS/$P/home
  rm -rf "$R"
  mkdir -p "$R/home/.config" "$R/home/.local/share" "$R/home/.local/state" "$R/home/.cache" "$R/cua"
  mkdir -m 700 "$R/home/.config/claude-secrets"
  export HOME=$R/home XDG_CONFIG_HOME=$R/home/.config XDG_DATA_HOME=$R/home/.local/share XDG_STATE_HOME=$R/home/.local/state XDG_CACHE_HOME=$R/home/.cache CUA_HOME=$R/cua
  node bin/cua.mjs install > "$L/install.out" 2>&1 || { log "install failed"; return 1; }
  log "run home $R installed"
}

case "$part" in
  parity|baseline|accept|device)
    log "== $part head $SHA label $LABEL device $DEVICE engine $ENGINE${ENGINE_BIN:+ $ENGINE_BIN} dirty=$([ -n "$DIRTY" ] && echo yes || echo no)"
    node "$FACADE/private-desktop.mjs" --harness "$WT" --out "$L/desktop" --session -- "$0" "inner-$part"
    status=$?
    cp "$L/desktop/session.json" "$OUT/$P/session.json"
    log "== $part exit $status"
    exit $status ;;
  inner-parity)
    export CUA_PARITY_SCRATCH_PREFIX=cua-m5-
    node scripts/repl-parity.mjs cleanup-prepared --device "$DEVICE" > "$L/cleanup-before.out" 2>&1 || true
    node scripts/repl-parity.mjs prepare --device "$DEVICE" --commit "$SHA" --native-only > "$L/prepare.json" 2> "$L/prepare.err" || { log "prepare failed"; exit 1; }
    PHOME=$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).ownedPreparation.home)' "$L/prepare.json")
    log "prepared home $PHOME on $(node -e 'const p=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(p.display,p.xSession.DBUS_SESSION_BUS_ADDRESS)' "$L/prepare.json")"
    if ! pinned_check "$PHOME" "$OUT/parity/pinned.txt"; then
      node scripts/repl-parity.mjs cleanup-prepared --device "$DEVICE" > "$L/cleanup.out" 2>&1
      exit 1
    fi
    rm -rf "$OUT/parity/vendor" "$OUT/parity/cua"
    node scripts/repl-parity.mjs run --device "$DEVICE" --suite native --host cua --engine vendor --out "$OUT/parity/vendor" > "$L/vendor.out" 2>&1; log "vendor exit $? $(tail -1 "$L/vendor.out")"
    node scripts/repl-parity.mjs run --device "$DEVICE" --suite native --host cua --engine cua ${lane_engine[@]+"${lane_engine[@]}"} --out "$OUT/parity/cua" > "$L/cua.out" 2>&1; log "cua exit $? $(tail -1 "$L/cua.out")"
    node scripts/repl-parity.mjs diff "$OUT/parity/vendor" "$OUT/parity/cua" --expected scripts/repl-parity/expected/native-linux.json > "$OUT/parity/diff.json" 2> "$L/diff.err"; d=$?; log "diff exit $d"
    node scripts/repl-parity.mjs cleanup-prepared --device "$DEVICE" > "$L/cleanup.out" 2>&1; k=$?; log "cleanup exit $k"
    # the diff's failure first; else a cleanup that did not finish fails the part (its prepared home may be left)
    [ "$d" -ne 0 ] && exit "$d"
    exit $k ;;
  inner-baseline)
    if pgrep -x gedit > /dev/null; then log "a gedit runs: the baseline refuses; not started"; exit 1; fi
    EXPERIMENT="171-m5-$(date -u +%Y%m%d)"
    node scripts/native-baseline.mjs prepare --device "$DEVICE" --commit "$SHA" > "$L/prepare.out" 2>&1 || { log "prepare failed"; exit 1; }
    # three runs a lane interleaved into $1 (cv, cc), each side summarised; the logs prefixed $2
    sitting() {
      rm -rf "$1/cv" "$1/cc"
      for n in 1 2 3; do
        node scripts/native-baseline.mjs run --device "$DEVICE" --experiment "$EXPERIMENT" --display "$CUA_PARITY_DISPLAY" --host cua --engine vendor --out "$1/cv/run-$n" > "$L/${2}cv-run-$n.out" 2>&1; log "${2}cv run-$n exit $?"
        node scripts/native-baseline.mjs run --device "$DEVICE" --experiment "$EXPERIMENT" --display "$CUA_PARITY_DISPLAY" --host cua --engine cua ${lane_engine[@]+"${lane_engine[@]}"} ${baseline_check[@]+"${baseline_check[@]}"} --out "$1/cc/run-$n" > "$L/${2}cc-run-$n.out" 2>&1; log "${2}cc run-$n exit $?"
      done
      node scripts/native-baseline.mjs summary "$1/cv" > "$L/${2}summary-cv.out" 2>&1; log "${2}summary cv exit $?"
      node scripts/native-baseline.mjs summary "$1/cc" > "$L/${2}summary-cc.out" 2>&1; log "${2}summary cc exit $?"
    }
    # a comparison's undetermined and unproved series into the log, the unproved ones into the step's record too
    report() {
      while read -r line; do log "$line"; done < <(grep -E '^(UNDETERMINED AFTER TOP-UP|UNPROVED)' "$1")
      grep '^UNPROVED' "$1" > "$OUT/baseline/unproved.txt"
    }
    sitting "$OUT/baseline" ""
    node scripts/native-baseline.mjs compare --engines "$OUT/baseline/cv" "$OUT/baseline/cc" --out "$OUT/baseline/engines.md" > "$L/compare.out" 2>&1; c=$?; log "compare exit $c $(grep -m1 VERDICT "$L/compare.out")"
    report "$L/compare.out"
    # Acceptance 3's remedy, once: the series the sitting left undetermined, when only they fail it, pooled with one
    # top-up of the same engine and display (the same private desktop and experiment); never a second
    need=$(sed -n 's/^TOP-UP NEEDED: //p' "$L/compare.out")
    if [ "$c" -ne 0 ] && [ -n "$need" ]; then
      log "top-up for $need"
      sitting "$OUT/baseline-topup" "topup-"
      node scripts/native-baseline.mjs compare --engines "$OUT/baseline/cv" "$OUT/baseline/cc" --top-up-baseline "$OUT/baseline-topup/cv" --top-up-candidate "$OUT/baseline-topup/cc" --out "$OUT/baseline/engines-topped-up.md" > "$L/compare-topped-up.out" 2>&1; c=$?
      report "$L/compare-topped-up.out"
      log "compare with its top-up exit $c $(grep -m1 VERDICT "$L/compare-topped-up.out")"
    fi
    exit $c ;;
  inner-accept|inner-device)
    run_home || exit 1
    if ! pinned_check "$CUA_HOME" "$OUT/$P/pinned.txt"; then rm -rf "$R"; exit 1; fi
    if [ "$ENGINE" = installed ]; then engine=$CUA_HOME/engine/linux/cua-engine; else engine=$ENGINE_BIN; fi
    if [ "$P" = accept ]; then fixture=scripts/accept/linux-native.mjs; report=accept-linux-native-cua.json; else fixture=scripts/accept/linux-device-mode.mjs; report=device-mode.json; fi
    env ${fixture_engine[@]+"${fixture_engine[@]}"} CUA_NATIVE_ENGINE=cua node "$FACADE/watch.mjs" "$OUT/$P/$report" "$OUT/$P/watch.json" -- node "$fixture" 2> "$L/fixture.err"
    a=$?; log "$fixture exit $a"
    node "$WT/scripts/linux-engine-gate/engine-watch.mjs" "$OUT/$P/watch.json" "$engine" > "$OUT/$P/engine-watch.txt" 2>&1
    w=$?; log "$(cat "$OUT/$P/engine-watch.txt")"
    rm -rf "$R"
    [ "$a" -ne 0 ] && exit "$a"
    exit $w ;;
esac
