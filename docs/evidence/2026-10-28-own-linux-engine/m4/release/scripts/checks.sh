#!/bin/bash
# task 80, step 4: linux-engine-v0.4.0's post-release checks on the released asset, each in a home of the run's (HOME,
# the XDG directories, an empty secret store and CUA_HOME under $T/homes/<part>, never the owner's) and, but for
# old-install, inside the M4 facade's private-desktop.mjs --session (a private Xvfb, Openbox, a private bus with
# accessibility on; never `:0`). The engine is the one that home's own `cua install` fetched at the checkout's pin,
# hash-checked against it; CUA_LINUX_ENGINE_BIN is never set. Run each part under locked.sh t80-release.
#   fresh        `cua install --engine` in an empty home; the engine's file type, --version, sha256 against the pin;
#                `CUA_NATIVE_ENGINE=cua cua doctor`
#   accept       Acceptance 1, scripts/accept/linux-native.mjs, CUA_NATIVE_ENGINE=cua, under the facade's 50 ms sampler
#   device       scripts/accept/linux-device-mode.mjs on the installed engine, under the same sampler
#   old-install  (ruling 700) a home on 0.3.0: `cua install` from OLD_WT, whose pin is linux-engine-v0.3.0
#   old          (ruling 700) that home under the pin checkout: doctor and one first request, then the update
#                (`cua install --engine`), then doctor and the first request again
# Environment: WT (the release checkout, detached at the pin commit, clean), OLD_WT (old-install only).
# usage: checks.sh <part>
set -u
T=/Users/new/.local/share/cua-171/task80
: "${WT:?}"
HERE=$WT/docs/evidence/2026-10-28-own-linux-engine/m4/facade/scripts
part=$1
P=${part#inner-}
OUT=$T/out/$P
L=$T/logs/$P
R=$T/homes/$P
[ "$P" = old-install ] && R=$T/homes/old   # the home old-install makes and old reads
mkdir -p "$OUT" "$L"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$L/checks.log"; }
pin() { node -e 'console.log(require(process.argv[1]).assets.x64[process.argv[2]] ?? require(process.argv[1])[process.argv[2]])' "$1/runtime/engine/linux-engine.json" "$2"; }
enter_home() {
  export HOME=$R/home XDG_CONFIG_HOME=$R/home/.config XDG_DATA_HOME=$R/home/.local/share XDG_STATE_HOME=$R/home/.local/state XDG_CACHE_HOME=$R/home/.cache CUA_HOME=$R/cua
  unset CUA_LINUX_ENGINE_BIN CUA_NATIVE_ENGINE
}
new_home() {
  rm -rf "$R"
  mkdir -p "$R/home/.config" "$R/home/.local/share" "$R/home/.local/state" "$R/home/.cache" "$R/cua"
  mkdir -m 700 "$R/home/.config/claude-secrets"
  enter_home
}
BIN() { echo "$CUA_HOME/engine/linux/cua-engine"; }
show_engine() {  # the installed engine against the pin of checkout $1
  local b; b=$(BIN)
  ls -l "$b"; file "$b"; "$b" --version
  echo "sha256 $(sha256sum "$b" | cut -d' ' -f1)"
  echo "pin    $(pin "$1" sha256) ($(pin "$1" release))"
  echo "== install.json"; cat "$CUA_HOME/engine/linux/install.json"; echo
}
at_pin() { [ "$(sha256sum "$(BIN)" | cut -d' ' -f1)" = "$(pin "$WT" sha256)" ]; }
engines_left() { echo "== cua-engine processes of this home left: $(pgrep -f -c "^$CUA_HOME/engine/linux/cua-engine" || true)"; }

cd "$WT" || exit 2
case "$part" in
  fresh|accept|device|old)
    [ -e /Users/new/.local/share/cua-171/hold-sittings ] && { log "hold-sittings exists: not started"; exit 3; }
    [ -z "$(git status --porcelain | grep -v '^?? node_modules$')" ] || { log "the checkout is not clean: not started"; exit 2; }
    log "== $part head $(git rev-parse HEAD) pin $(pin "$WT" release) $(pin "$WT" sha256)"
    node "$HERE/private-desktop.mjs" --harness "$WT" --out "$L/desktop" --session -- "$0" "inner-$part" > "$L/inner.out" 2>&1
    status=$?
    cp "$L/desktop/session.json" "$OUT/session.json"
    sed "s#$R#<home>#g" "$L/inner.out" > "$OUT/transcript.txt"
    log "== $part exit $status"
    exit $status ;;
  old-install)
    : "${OLD_WT:?}"
    new_home
    echo "== old-install: checkout $OLD_WT at $(git -C "$OLD_WT" rev-parse HEAD), pin $(pin "$OLD_WT" release) $(pin "$OLD_WT" sha256); home <home>"
    node "$OLD_WT/bin/cua.mjs" install; echo "install exit $?"
    show_engine "$OLD_WT"
    [ "$(sha256sum "$(BIN)" | cut -d' ' -f1)" = 5f4a1600e66b7f7b458948462fc4701942583af9674ad41798188d1312687b60 ] && echo "the home's engine is linux-engine-v0.3.0's x64 asset (5f4a1600…)" || { echo "the home's engine is NOT 0.3.0's asset"; exit 1; } ;;
  inner-fresh)
    new_home
    echo "== head $(git rev-parse HEAD); HOME, XDG directories, secret store and CUA_HOME the run's (<home>); DISPLAY=$DISPLAY; bus $DBUS_SESSION_BUS_ADDRESS"
    echo "== cua install --engine"
    node bin/cua.mjs install --engine; echo "install exit $?"
    echo "== installed engine"
    show_engine "$WT"
    at_pin && echo "sha256 equals the pin" || echo "sha256 DIFFERS from the pin"
    echo "== CUA_NATIVE_ENGINE=cua cua doctor"
    CUA_NATIVE_ENGINE=cua node bin/cua.mjs doctor; echo "doctor exit $?"
    engines_left
    rm -rf -- "$R"; [ -e "$R" ] && echo "home NOT removed" || echo "home removed" ;;
  inner-accept|inner-device)
    new_home
    echo "== head $(git rev-parse HEAD); home <home>; DISPLAY=$DISPLAY; bus $DBUS_SESSION_BUS_ADDRESS"
    node bin/cua.mjs install > "$L/install.out" 2>&1; echo "install exit $?"
    show_engine "$WT"
    at_pin || { echo "the installed engine is not the pin's: not run"; exit 1; }
    if [ "$P" = accept ]; then fixture=scripts/accept/linux-native.mjs; report=accept-linux-native-cua.json; else fixture=scripts/accept/linux-device-mode.mjs; report=device-mode.json; fi
    echo "== CUA_NATIVE_ENGINE=cua node $fixture (no CUA_LINUX_ENGINE_BIN) under the 50 ms sampler"
    CUA_NATIVE_ENGINE=cua node "$HERE/watch.mjs" "$OUT/$report" "$OUT/watch.json" -- node "$fixture" 2> "$L/fixture.err"
    a=$?; echo "fixture exit $a"
    tail -3 "$L/fixture.err"
    engines_left
    rm -rf -- "$R"; [ -e "$R" ] && echo "home NOT removed" || echo "home removed"
    exit $a ;;
  inner-old)
    [ -x "$R/cua/engine/linux/cua-engine" ] || { echo "no old-install home at <home>"; exit 2; }
    enter_home
    echo "== head $(git rev-parse HEAD) (the merged state: pin $(pin "$WT" release)); the home from old-install (<home>); DISPLAY=$DISPLAY; bus $DBUS_SESSION_BUS_ADDRESS"
    echo "== before the update: the home's engine"
    show_engine "$WT"
    for round in before after; do
      if [ $round = after ]; then
        echo "== the update: cua install --engine"
        node bin/cua.mjs install --engine; echo "install exit $?"
        show_engine "$WT"
        at_pin && echo "sha256 equals the pin" || echo "sha256 DIFFERS from the pin"
      fi
      echo "== $round: CUA_NATIVE_ENGINE=cua cua doctor"
      CUA_NATIVE_ENGINE=cua node bin/cua.mjs doctor; echo "doctor exit $?"
      echo "== $round: CUA_NATIVE_ENGINE=cua, one first request (cua.listApps through cua's service)"
      CUA_NATIVE_ENGINE=cua node "$T/first-request.mjs" "$WT"; echo "first request exit $?"
      engines_left
    done
    rm -rf -- "$R"; [ -e "$R" ] && echo "home NOT removed" || echo "home removed" ;;
  *) echo "unknown part $part" >&2; exit 2 ;;
esac
