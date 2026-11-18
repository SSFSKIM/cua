#!/bin/bash
# task 99 (T7), item 9 (pre-flight §1.2; from task 89's item9.sh): `cua install --engine` in an empty home of the run's
# (HOME, the XDG directories, an empty secret store and CUA_HOME a fresh mktemp -d, never the VM's default home), inside
# the M4 facade's private-desktop.mjs --session (a private Xvfb, Openbox, a private bus with accessibility on; never
# `:0`). Then `CUA_NATIVE_ENGINE=cua cua doctor` and `file` on the installed engine. CUA_LINUX_ENGINE_BIN is never set.
# The run's Node 24.22.1 first on PATH. The transcript names the fresh directory <fresh>.
# usage (under locked.sh): item9.sh            the outer part
#                          item9.sh inner       inside the private desktop
set -u
T=/Users/new/.local/share/cua-171/task99
WT=/Users/new/Developer/GitHub/cua/.claude/worktrees/t7-arm64
HERE=$WT/docs/evidence/2026-10-28-own-linux-engine/m4/facade/scripts
OUT=$T/item9
export PATH=/Users/new/.local/share/cua-171/node24/bin:$PATH
pin() { node -e 'const p=require(process.argv[1]);console.log(p.assets.arm64[process.argv[2]] ?? p[process.argv[2]])' "$WT/runtime/engine/linux-engine.json" "$1"; }
cd "$WT" || exit 2
if [ "${1:-}" != inner ]; then
  [ -e /Users/new/.local/share/cua-171/hold-sittings ] && { echo "hold-sittings exists: not started"; exit 3; }
  [ -z "$(git status --porcelain)" ] || { echo "the checkout is not clean: not started"; exit 2; }
  rm -rf "$OUT"; mkdir -p "$OUT"
  echo "== item 9 head $(git rev-parse HEAD) pin $(pin release) $(pin sha256) start $(date -u +%FT%TZ) node $(node --version)"
  node "$HERE/private-desktop.mjs" --harness "$WT" --out "$OUT/desktop" --session -- "$T/item9.sh" inner > "$OUT/inner.out" 2>&1
  status=$?
  echo "== item 9 exit $status end $(date -u +%FT%TZ)"
  exit $status
fi
FRESH=$(mktemp -d)
H=$FRESH/home
mkdir -p "$H/.config" "$H/.local/share" "$H/.local/state" "$H/.cache"
mkdir -m 700 "$H/.config/claude-secrets"
export HOME=$H XDG_CONFIG_HOME=$H/.config XDG_DATA_HOME=$H/.local/share XDG_STATE_HOME=$H/.local/state XDG_CACHE_HOME=$H/.cache
export CUA_HOME=$FRESH/cua
unset CUA_LINUX_ENGINE_BIN CUA_NATIVE_ENGINE
{
echo "== head $(git rev-parse HEAD); $(uname -m); HOME, XDG directories, an empty secret store and CUA_HOME the run's (<fresh> = mktemp -d); DISPLAY=$DISPLAY; bus $DBUS_SESSION_BUS_ADDRESS"
echo "== CUA_HOME before install: $(ls -A "$CUA_HOME" 2>/dev/null | wc -l) entries"
echo "== cua install --engine"
node bin/cua.mjs install --engine; echo "install exit $?"
B=$CUA_HOME/engine/linux/cua-engine
echo "== installed engine"
ls -l "$B"
file "$B"
"$B" --version
s=$(sha256sum "$B" | cut -d' ' -f1)
echo "sha256 $s"
echo "pin    $(pin sha256) ($(pin release))"
[ "$s" = "$(pin sha256)" ] && echo "sha256 equals the pin" || echo "sha256 DIFFERS from the pin"
echo "== install.json"; cat "$CUA_HOME/engine/linux/install.json"; echo
echo "== CUA_NATIVE_ENGINE=cua cua doctor"
CUA_NATIVE_ENGINE=cua node bin/cua.mjs doctor; echo "doctor exit $?"
echo "== cua-engine processes of this home left: $(pgrep -f -c "^$CUA_HOME/engine/linux/cua-engine" || true)"
} 2>&1 | sed "s#$FRESH#<fresh>#g" | tee "$T/item9/transcript.txt"
rm -rf -- "$FRESH"; [ -e "$FRESH" ] && echo "fresh home NOT removed" || echo "fresh home removed"
