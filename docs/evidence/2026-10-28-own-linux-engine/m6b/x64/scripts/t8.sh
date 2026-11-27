#!/bin/bash
# T8's (task 173) counted x64 runs at H = 3722f2826, on private displays, in homes of the run's. Each phase runs under
# locked.sh t173 timeout -s TERM -k 60 <N>m (chain.sh). Phases:
#   npmci     the checkout's dependencies
#   cells     acceptance 13's driver: E0-E3, U0-U5, 20 first-answer samples a side, the older cua at 854103aa5
#   srchome   a source home: H's `cua install` in a fresh HOME and CUA_HOME (makes no runtimes/)
#   r1        suites.sh parity, PARITY_HOME the source home, LABEL=counted
#   r3d r3c   suites.sh accept, SELECTION=default / explicit (CUA_NATIVE_ENGINE=cua)
#   r4        suites.sh device, SELECTION=default
#   fallback  suites.sh fallback, SELECTION=default
#   fxverify  the comparator fixture verified (sha256sum -c, the list's hash, the module's check)
#   fixture   gate.mjs run E1 and FB --pinned <source home> --vendor-fixture --newest, HOME/CUA_HOME the source home;
#             MODE=trace runs each under strace -f --seccomp-bpf -e trace=%file
#   prov      scripts/modules-pin.mjs on both real debs at H, then git diff --exit-code of provenance.json
set -u
T=/Users/new/.local/share/cua-171/t173
WT=$(cd "$T/wt" && pwd -P)
RUN=$T/run
SRC=$RUN/src
REAL_HOME=$HOME
OLDER=/Users/new/.local/share/cua-171/t170/older
FIXTURE=$REAL_HOME/.local/share/cua-171/vendor-x64-pinned
NEWEST=$REAL_HOME/.local/share/cua-171/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64
cd "$WT" || exit 2
phase=$1
dirty=$(git status --porcelain)
echo "== $phase at $(git rev-parse HEAD) $(date -u +%FT%TZ) dirty=$([ -n "$dirty" ] && echo yes || echo no)"
[ -n "$dirty" ] && echo "$dirty"
[ -e "$REAL_HOME/.local/share/cua-171/hold-sittings" ] && { echo "the host is held for sittings"; exit 2; }
echo "free on /: $(df -h --output=avail / | tail -1)"
scrub() { env -u CUA_NATIVE_ENGINE -u CUA_LINUX_ENGINE_BIN -u CUA_HOME -u DISPLAY -u WAYLAND_DISPLAY -u DBUS_SESSION_BUS_ADDRESS "$@"; }
srcenv=(HOME="$SRC/home" XDG_CONFIG_HOME="$SRC/home/.config" XDG_DATA_HOME="$SRC/home/.local/share" XDG_STATE_HOME="$SRC/home/.local/state" XDG_CACHE_HOME="$SRC/home/.cache" CUA_HOME="$SRC/cua")
case "$phase" in
  npmci) npm ci ;;
  xprobe) env PATH="$HOME/.cargo/bin:$PATH" cargo build --release --manifest-path scripts/linux-engine-diff/xprobe/Cargo.toml ;;
  cells)
    C=$RUN/cells
    [ -e "$C" ] && { echo "$C exists"; exit 2; }
    scrub scripts/accept/linux-runtime-env.sh "$C" -- node scripts/accept/linux-runtime.mjs --out "$C/artifact" --older "$OLDER" --leg x64 --samples 20
    c=$?; echo "cells exit $c"; exit $c ;;
  srchome)
    [ -e "$SRC" ] && { echo "$SRC exists"; exit 2; }
    mkdir -p "$SRC/home/.config" "$SRC/home/.local/share" "$SRC/home/.local/state" "$SRC/home/.cache" "$SRC/cua"
    mkdir -m 700 "$SRC/home/.config/claude-secrets"
    scrub "${srcenv[@]}" node bin/cua.mjs install --json > "$RUN/src-install.json" 2> "$RUN/src-install.err"
    c=$?; echo "install exit $c"; ls -la "$SRC/cua"; ls -d "$SRC/home/runtimes" "$SRC/cua/runtimes" 2>&1; exit $c ;;
  r1|r3d|r3c|r4|fallback)
    case "$phase" in
      r1) part=parity; sel=() ;;
      r3d) part=accept; sel=(SELECTION=default) ;;
      r3c) part=accept; sel=() ;;
      r4) part=device; sel=(SELECTION=default) ;;
      fallback) part=fallback; sel=(SELECTION=default) ;;
    esac
    D=$RUN/reg/$phase
    [ -e "$D" ] && { echo "$D exists"; exit 2; }
    mkdir -p "$D/out"; L=$(mktemp -d /tmp/c173-$phase-XXXXXX)
    extra=(); [ "$phase" = r1 ] && extra=(PARITY_HOME="$SRC/cua")
    scrub OUT="$D/out" LOGS="$L" LABEL=counted DEVICE=cua-171 ENGINE=installed "${sel[@]}" "${extra[@]}" bash scripts/linux-engine-gate/suites.sh "$part"
    c=$?; echo "$phase ($part) exit $c"; cp -r "$L" "$D/logs"; find "$D/logs" -type s -delete; rm -rf "$L"; exit $c ;;
  fxverify)
    F=$RUN/fxverify; mkdir -p "$F"
    {
      echo "\$ (cd $FIXTURE && sha256sum -c SHA256SUMS)"; (cd "$FIXTURE" && sha256sum -c SHA256SUMS); echo "(exit $?)"
      echo; echo "\$ sha256sum $FIXTURE/tree-sha256.txt; wc -l"; sha256sum "$FIXTURE/tree-sha256.txt"; wc -l < "$FIXTURE/tree-sha256.txt"
      echo; echo "\$ stat -c '%s %n' $FIXTURE/26.928.40906-linux-x64.tar"; stat -c '%s %n' "$FIXTURE/26.928.40906-linux-x64.tar"
      echo; echo "\$ node scripts/linux-engine-gate/fixture-check.mjs --vendor-fixture $FIXTURE --arch x64 -- true"
      node scripts/linux-engine-gate/fixture-check.mjs --vendor-fixture "$FIXTURE" --arch x64 -- true; echo "(exit $?)"
      echo; echo "\$ node -e verifyVendorFixture({dir, arch: 'x64'})"
      node -e 'import("./scripts/linux-engine-diff/vendor-fixture.mjs").then(m => { const r = m.verifyVendorFixture({dir: process.argv[1], arch: "x64"}); console.log(JSON.stringify(r, null, 1)); })' "$FIXTURE"; echo "(exit $?)"
      echo; echo "\$ the manifest's x64 entry (scripts/linux-engine-gate/vendor-fixture.json)"
      node -e 'const m=require("./scripts/linux-engine-gate/vendor-fixture.json"); console.log(JSON.stringify(m.x64 ?? m.fixtures?.x64 ?? m, null, 1))'
      echo; echo "\$ sha256sum <the extracted sky_linux_x64> <service.js> <newest>"
      sha256sum "$FIXTURE/extracted/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64" "$FIXTURE/extracted/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky/dist/project/cua/sky_js/src/service.js" "$NEWEST"
    } > "$F/fixture-verify.txt" 2>&1
    cat "$F/fixture-verify.txt"
    grep -q '^(exit [1-9]' "$F/fixture-verify.txt" && exit 1; exit 0 ;;
  fixture)
    MODE=${MODE:-plain}; FX=$RUN/fixture-$MODE
    [ -e "$FX" ] && { echo "$FX exists"; exit 2; }
    mkdir -p "$FX"
    PINNED=$SRC/cua
    CAND=$PINNED/engine/linux/cua-engine
    {
      echo "pinned home $PINNED"; echo "engine $CAND"; sha256sum "$CAND"
      node -e 'const p=require("./runtime/engine/linux-engine.json");console.log("pin", JSON.stringify(p))'
      echo "fixture $FIXTURE"
      echo "vendor $FIXTURE/extracted/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64"
      sha256sum "$FIXTURE/extracted/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64"
      echo "vendor-js service.js"; sha256sum "$FIXTURE/extracted/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky/dist/project/cua/sky_js/src/service.js"
      echo "newest $NEWEST"; sha256sum "$NEWEST"
      echo "runtimes/ in the step homes:"; ls -d "$SRC/home/runtimes" "$SRC/cua/runtimes" 2>&1
    } > "$FX/bindings.txt" 2>&1
    s=0
    for step in ${FIXTURE_STEPS:-E1 FB}; do
      if [ "$MODE" = trace ]; then tracer=(strace -f -qq --seccomp-bpf -e trace=%file -o "$FX/$step.strace"); else tracer=(); fi
      scrub "${srcenv[@]}" GH_CONFIG_DIR="$REAL_HOME/.config/gh" \
        ${tracer[@]+"${tracer[@]}"} node scripts/linux-engine-gate/gate.mjs run "$step" --pinned "$PINNED" --out "$FX/out" --vendor-fixture "$FIXTURE" --newest "$NEWEST" > "$FX/$step.out" 2>&1
      c=$?; echo "$step exit $c"; [ "$c" -eq 0 ] || s=1
      [ "$MODE" = trace ] || continue
      echo "$step: trace lines $(wc -l < "$FX/$step.strace"), naming a runtimes/ path: $(grep -c '/runtimes/' "$FX/$step.strace")" | tee -a "$FX/trace-check.txt"
      grep '/runtimes/' "$FX/$step.strace" | head -20 >> "$FX/trace-check.txt"
      gzip -9 "$FX/$step.strace"
    done
    exit $s ;;
  prov)
    P=$RUN/prov; mkdir -p "$P"
    {
      echo "\$ git rev-parse HEAD"; git rev-parse HEAD
      echo "\$ ls runtime/releases runtime/provenance"; ls runtime/releases runtime/provenance
      echo "\$ sha256sum runtime/modules/provenance.json"; sha256sum runtime/modules/provenance.json
      echo "\$ node scripts/modules-pin.mjs /var/cache/cua/chatgpt_26.928.40906_amd64.deb $REAL_HOME/.local/share/cua-171/task144/arm64-deb/chatgpt_26.928.40906_arm64.deb"
      node scripts/modules-pin.mjs /var/cache/cua/chatgpt_26.928.40906_amd64.deb "$REAL_HOME/.local/share/cua-171/task144/arm64-deb/chatgpt_26.928.40906_arm64.deb"; echo "(exit $?)"
      echo "\$ sha256sum runtime/modules/provenance.json"; sha256sum runtime/modules/provenance.json
      echo "\$ git diff --exit-code runtime/modules/provenance.json"; git diff --exit-code runtime/modules/provenance.json; echo "(exit $?)"
      echo "\$ git status --porcelain"; git status --porcelain; echo "(end)"
    } > "$P/provenance-at-H.txt" 2>&1
    tail -8 "$P/provenance-at-H.txt"
    grep -q '^(exit [1-9]' "$P/provenance-at-H.txt" && exit 1; exit 0 ;;
  *) echo "unknown phase $phase"; exit 2 ;;
esac
