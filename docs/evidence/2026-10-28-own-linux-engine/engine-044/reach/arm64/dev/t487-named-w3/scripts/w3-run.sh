#!/bin/bash
# Task 147, ruling 1143 (c): one t487-named x100 run at twice the load on one pinned home, development but gating by
# ruling. Task 142's private-run.mjs (the gate's runOnPrivateDisplay: Xvfb, Openbox, the `person` xterm; never :0) from
# t147-w3 (5f59e5bc, read only), CUA_HOME the run's own home, the engine its pinned build, `--plan t487-named --trials
# 100 --load-factor 2`. One hold of the VM's lock (holder h9-arm64); hold-sittings, the disk (more than 20G free) and
# the engine's sha256 checked first. Then pilot-table.mjs (wave 3's per-drop table and the judge's counts) and the
# judge's own table from the run's summary.
# usage: w3-run.sh <044|043>
set -u
D=/Users/new/.local/share/cua-171
T=$D/task147
G=/Users/new/Developer/GitHub/cua/.claude/worktrees/t147-w3
v=$1
case $v in
  044) PIN=f54b2aeb8e00676a9f521410156c9bdd1b578e2308724013eef2eb6145c7da3e ;;
  043) PIN=dd74e19b44596f992dd120b13fbbe8021a7ca0af581c07496f5cee8f5edbcf1e ;;
  *) echo "usage: w3-run.sh <044|043>"; exit 2 ;;
esac
ACC=$D/m5/home-arm64-$v
E=$ACC/engine/linux/cua-engine
OUT=$T/out/w3-t487-named-$v
LABEL=dev-t147-w3-t487-named-$v-load2
P=$G/docs/evidence/2026-10-28-own-linux-engine/m5/harness-487/private-run.mjs
W=$G/docs/evidence/2026-10-28-own-linux-engine/m5/harness-487/wave3/pilot-table.mjs
export PATH=$D/node24/bin:$PATH
mkdir -p "$T/out"
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$T/out/w3.log"; }
[ -e "$D/hold-sittings" ] && { log "$v: hold-sittings present: not started"; exit 5; }
f=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
[ "$f" -le 20 ] && { log "$v: disk ${f}G free, 20G or less: not started"; exit 9; }
[ -e "$OUT" ] && { log "$v: $OUT exists: not started"; exit 2; }
[ "$(sha256sum "$E" | cut -d' ' -f1)" = "$PIN" ] || { log "$v: the engine's sha256 differs from its pin: not started"; exit 2; }
log "$v: queued at $(git -C "$G" rev-parse HEAD) ($(git -C "$G" status --porcelain --untracked-files=no | wc -l) changes), $("$E" --version), df ${f}G load=$(cut -d' ' -f1-3 /proc/loadavg)"
cd "$G" || exit 2
CUA_LOCK_MAX=50m "$D/locked.sh" h9-arm64 bash -c '
  [ -e "'"$D"'/hold-sittings" ] && { echo "hold-sittings present at the hold: not started"; exit 5; }
  exec env CUA_HOME="'"$ACC"'" PATH="'"$D"'/task59/bin:'"$D"'/node24/bin:/Users/new/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
    timeout -s TERM -k 60 45m node "'"$P"'" "'"$OUT"'" "'"$LABEL"'" --experiment drop-signals --family electron --plan t487-named \
      --trials 100 --load-factor 2 --cua "'"$E"'" --run "'"$LABEL"'"' > "$T/out/w3-t487-named-$v.driver.out" 2>&1
code=$?
log "$v: end exit $code load=$(cut -d' ' -f1-3 /proc/loadavg)"
node "$W" "$G/scripts/linux-engine-diff/drop-signals-judge.mjs" "$OUT/run/results.jsonl" > "$OUT/pilot-table.md" 2>&1
log "$v: counts $(tail -1 "$OUT/pilot-table.md")"
exit $code
