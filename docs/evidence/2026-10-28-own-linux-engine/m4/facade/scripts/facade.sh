#!/bin/bash
# M4's facade suites (T18) on a private desktop, never the person's `:0`: each part runs inside private-desktop.mjs
# (beside this script) and writes its evidence under $OUT/<part>/, its logs under $LOGS/<part>/. Run each part under the
# host lock (locked.sh), one at a time.
#   parity    repl-parity's native suite on both engine lanes, prepared --native-only, and the diff against
#             scripts/repl-parity/expected/native-linux.json                                   (--session)
#   baseline  native-baseline, three runs a lane interleaved, summaries and compare --engines  (--session)
#   accept    scripts/accept/linux-native.mjs, CUA_NATIVE_ENGINE=cua, in a home of the run's   (--session)
#   device    scripts/accept/linux-device-mode.mjs, in the same kind of home                   (--session)
#   services  the two-services instrument on gedit, Chrome and the over-budget page            (bare: its Desktop
#             starts the run's session itself)
# Environment: ENGINE_BIN (the engine build, named cua-engine), OUT (the evidence directory), LOGS (the log directory),
# LABEL (pilot or counted; a counted run refuses a dirty tree).
# usage: facade.sh <part>
set -u
WT=$(cd "$(dirname "$0")/../../../../../.." && pwd)
HERE=$(cd "$(dirname "$0")" && pwd)
DEVICE=cua-171
: "${ENGINE_BIN:?}" "${OUT:?}" "${LOGS:?}" "${LABEL:?}"
cd "$WT" || exit 2
part=$1
SHA=$(git rev-parse HEAD)
DIRTY=$(git status --porcelain)
if [ "$LABEL" = counted ] && [ -n "$DIRTY" ]; then echo "a counted run needs a clean tree" >&2; exit 2; fi
case "$part" in
  parity|baseline|accept|device|services) ;;
  inner-*) ;;
  *) echo "unknown part $part" >&2; exit 2 ;;
esac
P=${part#inner-}
mkdir -p "$OUT/$P" "$LOGS/$P"
L=$LOGS/$P
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$L/facade.log"; }

# the run-owned home of the acceptance fixtures: HOME and the XDG directories, an empty secret store, a cua home with
# the release install (whose pinned engine the service refuses; the build is named by CUA_LINUX_ENGINE_BIN)
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
  parity|baseline|accept|device|services)
    mode=--session; [ "$part" = services ] && mode=
    log "== $part head $SHA label $LABEL dirty=$([ -n "$DIRTY" ] && echo yes || echo no) engine $("$ENGINE_BIN" --version) sha256 $(sha256sum "$ENGINE_BIN" | cut -d' ' -f1)"
    node "$HERE/private-desktop.mjs" --harness "$WT" --out "$L/desktop" $mode -- "$0" "inner-$part"
    status=$?
    cp "$L/desktop/session.json" "$OUT/$P/session.json"
    log "== $part exit $status"
    exit $status ;;
  inner-parity)
    export CUA_PARITY_SCRATCH_PREFIX=cua-m4t18-
    node scripts/repl-parity.mjs cleanup-prepared --device "$DEVICE" > "$L/cleanup-before.out" 2>&1 || true
    node scripts/repl-parity.mjs prepare --device "$DEVICE" --commit "$SHA" --native-only > "$L/prepare.json" 2> "$L/prepare.err" || { log "prepare failed"; exit 1; }
    log "prepared on $(node -e 'const p=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(p.display,p.xSession.DBUS_SESSION_BUS_ADDRESS,p.profile)' "$L/prepare.json")"
    rm -rf "$OUT/parity/vendor" "$OUT/parity/cua"
    node scripts/repl-parity.mjs run --device "$DEVICE" --suite native --host cua --engine vendor --out "$OUT/parity/vendor" > "$L/vendor.out" 2>&1; log "vendor exit $? $(tail -1 "$L/vendor.out")"
    node scripts/repl-parity.mjs run --device "$DEVICE" --suite native --host cua --engine cua --engine-bin "$ENGINE_BIN" --out "$OUT/parity/cua" > "$L/cua.out" 2>&1; log "cua exit $? $(tail -1 "$L/cua.out")"
    node scripts/repl-parity.mjs diff "$OUT/parity/vendor" "$OUT/parity/cua" --expected scripts/repl-parity/expected/native-linux.json > "$OUT/parity/diff.json" 2> "$L/diff.err"; d=$?; log "diff exit $d"
    node scripts/repl-parity.mjs cleanup-prepared --device "$DEVICE" > "$L/cleanup.out" 2>&1; log "cleanup exit $?"
    exit $d ;;
  inner-baseline)
    if pgrep -x gedit > /dev/null; then log "a gedit runs: the baseline refuses; not started"; exit 1; fi
    EXPERIMENT="171-m4-$(date -u +%Y%m%d)"
    node scripts/native-baseline.mjs prepare --device "$DEVICE" --commit "$SHA" > "$L/prepare.out" 2>&1 || { log "prepare failed"; exit 1; }
    rm -rf "$OUT/baseline/cv" "$OUT/baseline/cc"
    for n in 1 2 3; do
      node scripts/native-baseline.mjs run --device "$DEVICE" --experiment "$EXPERIMENT" --display "$CUA_PARITY_DISPLAY" --host cua --engine vendor --out "$OUT/baseline/cv/run-$n" > "$L/cv-run-$n.out" 2>&1; log "cv run-$n exit $?"
      node scripts/native-baseline.mjs run --device "$DEVICE" --experiment "$EXPERIMENT" --display "$CUA_PARITY_DISPLAY" --host cua --engine cua --engine-bin "$ENGINE_BIN" --out "$OUT/baseline/cc/run-$n" > "$L/cc-run-$n.out" 2>&1; log "cc run-$n exit $?"
    done
    node scripts/native-baseline.mjs summary "$OUT/baseline/cv" > "$L/summary-cv.out" 2>&1; log "summary cv exit $?"
    node scripts/native-baseline.mjs summary "$OUT/baseline/cc" > "$L/summary-cc.out" 2>&1; log "summary cc exit $?"
    node scripts/native-baseline.mjs compare --engines "$OUT/baseline/cv" "$OUT/baseline/cc" --out "$OUT/baseline/engines.md" > "$L/compare.out" 2>&1; c=$?; log "compare exit $c $(grep -m1 VERDICT "$L/compare.out")"
    exit $c ;;
  inner-accept)
    run_home || exit 1
    CUA_NATIVE_ENGINE=cua CUA_LINUX_ENGINE_BIN="$ENGINE_BIN" node "$HERE/watch.mjs" "$OUT/accept/accept-linux-native-cua.json" "$OUT/accept/watch.json" -- node scripts/accept/linux-native.mjs 2> "$L/accept.err"
    a=$?; log "linux-native exit $a"
    rm -rf "$R"
    exit $a ;;
  inner-device)
    run_home || exit 1
    CUA_NATIVE_ENGINE=cua CUA_LINUX_ENGINE_BIN="$ENGINE_BIN" node "$HERE/watch.mjs" "$OUT/device/device-mode.json" "$OUT/device/watch.json" -- node scripts/accept/linux-device-mode.mjs 2> "$L/device.err"
    a=$?; log "device-mode exit $a"
    rm -rf "$R"
    exit $a ;;
  inner-services)
    SKY="$HOME/.local/share/cua/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky"
    rm -rf "$OUT/services/run"
    node scripts/linux-engine-diff/services.mjs --vendor-js "$SKY" --engine "$ENGINE_BIN" --out "$OUT/services/run" --scenes gedit,chrome,over-budget > "$L/services.out" 2>&1
    s=$?; log "services exit $s"
    exit $s ;;
esac
