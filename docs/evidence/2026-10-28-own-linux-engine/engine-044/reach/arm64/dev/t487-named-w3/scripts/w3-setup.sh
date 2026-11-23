#!/bin/bash
# Task 147, ruling 1143 (c): the checkout for the counted #487 measurement and the two homes checked. A fresh VM worktree
# t147-w3 detached at origin/engine-044-pr 5f59e5bc (H9 plus the reach evidence, main and harness fix wave 3; nothing
# under native/linux-engine differs from H9), with npm ci, the Electron binary checked and xprobe built (setup.sh, under
# the lock). Then, from t147-w3: home-arm64-044's engine sha256 against the pin and `check --pinned`; home-arm64-043's
# engine sha256 against 0.4.3's pin (dd74e19b…cf1e) and its --version. It stops at the first part that fails.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task147
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t147-w3
HEAD=5f59e5bcbb94c06c1a0327a76c0642e24a48482d
L="$D/locked.sh h9-arm64"
export PATH=$D/node24/bin:$PATH
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$T/w3-setup.log"; }
[ -e "$D/hold-sittings" ] && { log "hold-sittings present"; exit 5; }
log "df / avail $(df -BG --output=avail / | tail -1 | tr -d ' ')"
$L "$T/setup.sh" t147-w3 "$HEAD" > "$T/setup-w3.log" 2>&1; c=$?; log "setup t147-w3 exit $c"
[ "$c" = 0 ] || exit 1
[ -x "$G/node_modules/electron/dist/electron" ] || { log "electron binary missing"; exit 1; }
log "electron present: $("$G/node_modules/electron/dist/electron" --version 2>/dev/null)"
git -C "$G" diff --quiet cd03a47bde2a484e1c3ecbf07cc97aada720fda7 HEAD -- native/linux-engine && log "native/linux-engine as at H9" || { log "native/linux-engine DIFFERS from H9"; exit 1; }
E44=$D/m5/home-arm64-044/engine/linux/cua-engine
P44=$(node -e 'console.log(require(process.argv[1]).assets.arm64.sha256)' "$G/runtime/engine/linux-engine.json")
s=$(sha256sum "$E44" | cut -d' ' -f1)
log "home-arm64-044: sha256 $s, the pin $P44: $([ "$s" = "$P44" ] && echo equal || echo DIFFERS); $("$E44" --version)"
[ "$s" = "$P44" ] || exit 1
(cd "$G" && node scripts/linux-engine-gate/gate.mjs check --pinned "$D/m5/home-arm64-044") > "$T/w3-check-044.txt" 2>&1; c=$?
log "check --pinned home-arm64-044 exit $c: $(grep -o '"engine_tree":{[^}]*}' "$T/w3-check-044.txt")"
[ "$c" = 0 ] || exit 1
E43=$D/m5/home-arm64-043/engine/linux/cua-engine
P43=dd74e19b44596f992dd120b13fbbe8021a7ca0af581c07496f5cee8f5edbcf1e
s=$(sha256sum "$E43" | cut -d' ' -f1)
log "home-arm64-043: sha256 $s, 0.4.3's pin $P43: $([ "$s" = "$P43" ] && echo equal || echo DIFFERS); $("$E43" --version)"
[ "$s" = "$P43" ] || exit 1
log "w3-setup done"
