#!/bin/bash
# Task 122 at H7 = ae3fc1e8 (rulings 954-956, 963, 969): the counted C1 and L4c on arm64. A fresh worktree t122-h7c
# detached at H7 (setup.sh: npm ci, electron, xprobe), the pinned 0.4.2 home home-arm64-042 checked (the engine's
# sha256 against H7's pin, `gate.mjs check --pinned` from the H7 checkout), then each step's line as `gate.mjs print`
# gives it (holder task122-arm64, out m5/out-arm64-h7): C1 at idle, L4c at twice the load, each its own hold. The
# printed line's own `locked.sh task122-arm64` takes the hold, and inside it step.sh's quiet wait (up to 6 minutes for
# no stress-ng and a 1-minute load below 1.0) runs before the printed gate command, which runs unchanged. hold-sittings
# and the disk (ruling 937) are checked before each part. It stops at the first part that fails.
set -u
D=/Users/new/.local/share/cua-171
T=$D/task122
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t122-h7c
H7=ae3fc1e8
ACC=$D/m5/home-arm64-042
OUT=$D/m5/out-arm64-h7
L="$D/locked.sh task122-arm64"
mkdir -p "$OUT"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$OUT/h7.log"; }
pre() {
  [ -e "$D/hold-sittings" ] && { log "hold-sittings present: $1 not started"; exit 5; }
  local f; f=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
  [ "$f" -le 20 ] && { log "disk: ${f}G free, 20G or less (ruling 937): $1 not started"; exit 9; }
  log "pre $1: hold-sittings absent, df / ${f}G, load $(cut -d' ' -f1-3 /proc/loadavg)"
}
export PATH=$D/node24/bin:$PATH
pre setup
# the worktree made once (setup.sh refuses an existing one): on a second start, it must already be at H7 and clean
if [ -e "$G" ]; then
  [ "$(git -C "$G" rev-parse HEAD)" = "$(git -C "$G" rev-parse "$H7^{commit}")" ] && [ -z "$(git -C "$G" status --porcelain)" ] || { log "$G is not clean at H7"; exit 1; }
  log "setup: t122-h7c already at H7, clean"
else
  $L "$T/setup.sh" t122-h7c "$H7" > "$T/setup-h7c.log" 2>&1; c=$?; log "setup t122-h7c exit $c"
  [ "$c" = 0 ] || exit 1
fi
{
  cd "$G" || exit 2
  echo "== head $(git rev-parse HEAD), $(git status --porcelain | wc -l) changes, $(date -u +%FT%TZ)"
  s=$(sha256sum "$ACC/engine/linux/cua-engine" | cut -d' ' -f1)
  p=$(node -e 'console.log(require(process.argv[1]).assets.arm64.sha256)' "$G/runtime/engine/linux-engine.json")
  echo "engine sha256 $s; H7's pin $p; $([ "$s" = "$p" ] && echo equal || echo DIFFERS)"
  "$ACC/engine/linux/cua-engine" --version
  node scripts/linux-engine-gate/gate.mjs check --pinned "$ACC"; echo "check exit $?"
} > "$OUT/home-check-h7.txt" 2>&1
grep -q "equal$" "$OUT/home-check-h7.txt" && grep -q "^check exit 0" "$OUT/home-check-h7.txt" || { log "home check failed: $OUT/home-check-h7.txt"; exit 1; }
log "home check: sha256 equals H7's pin, check --pinned exit 0"
QUIET='s=$(date +%s); while [ $(( $(date +%s) - s )) -lt 360 ]; do if ! pgrep -x stress-ng > /dev/null && awk -v l="$(cut -d" " -f1 /proc/loadavg)" "BEGIN{exit !(l < 1.0)}"; then break; fi; sleep 10; done; echo "quiet wait $(( $(date +%s) - s )) s: load $(cut -d" " -f1-3 /proc/loadavg) stress-ng $(pgrep -c -x stress-ng)"'
for step in C1 L4c; do
  [ -e "$OUT/$step.pinned-release" ] && { log "$OUT/$step.pinned-release exists: not started"; exit 2; }
  node "$G/scripts/linux-engine-gate/gate.mjs" print "$step" --pinned "$ACC" --out "$OUT" --holder task122-arm64 > "$OUT/$step.print.txt" 2>&1 || { log "print $step failed"; exit 1; }
  # `gate.mjs print` writes the step's record directory (step.json, README.md), which `run` then refuses as an earlier
  # execution: it is kept apart as the print's record
  [ -e "$OUT/$step.pinned-release" ] && mv "$OUT/$step.pinned-release" "$OUT/$step.print-record"
  cmd=$(tail -1 "$OUT/$step.print.txt")
  case "$cmd" in "$L "*) gate=${cmd#"$L "} ;; *) log "$step's printed line does not start with the lock: refused"; exit 2 ;; esac
  pre "$step"
  log "run $step as printed, the quiet wait inside its hold: $cmd"
  CUA_LOCK_MAX=56m $L bash -c "$QUIET; [ -e $D/hold-sittings ] && { echo hold-sittings present; exit 5; }; exec $gate" > "$OUT/$step.driver.out" 2>&1
  c=$?
  log "end $step exit $c load=$(cut -d' ' -f1-3 /proc/loadavg) $(grep -m1 '^quiet wait' "$OUT/$step.driver.out")"
  [ "$c" = 0 ] || { log "$step exited $c: stopped for the controller"; exit 1; }
done
log "h7 done"
