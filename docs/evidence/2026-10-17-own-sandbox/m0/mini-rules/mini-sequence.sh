#!/bin/bash
# M0c's mini items, in order, each gated by the mini rules (the spec's Decision Log, "native runs on the mini"):
# the CI idle check twice 45 s apart and the mini's 1-minute load under 2 before every item, the frontmost app after
# every item (a system prompt stops the whole sequence). Usage: mini-sequence.sh <harness commit> [items...]
set -u
COMMIT=$1; shift
ITEMS=${*:-native-prepare tz vendor browser accept}
W=/Users/new/Developer/GitHub/cua-wt-115-m0b
E=$W/docs/evidence/2026-10-17-own-sandbox/m0
RULES=$E/mini-rules
LOG=$RULES/sitting-log.txt
APPROVED=/Users/new/cua-115/home
mkdir -p "$RULES"
cd "$W"
say() { echo "$(date -u +%FT%TZ) $*" | tee -a "$LOG"; }

wait_idle() {  # $1: what is about to run
  for i in $(seq 240); do
    load=$(ssh -o BatchMode=yes mini uptime | sed -E 's/.*load averages?: ([0-9.]+).*/\1/')
    if awk -v x="$load" 'BEGIN{exit !(x<2)}' && "$RULES/mini-idle.sh" >>"$LOG" 2>&1; then
      say "idle before $1 (mini 1-min load $load): $(ssh -o BatchMode=yes mini uptime)"
      return 0
    fi
    say "waiting before $1 (mini 1-min load $load)"
    sleep 60
  done
  say "STOP: the mini did not become idle before $1"; exit 3
}
front() {  # $1: what just ran
  if ! "$RULES/mini-front.sh" >>"$LOG" 2>&1; then say "STOP: a system prompt is frontmost after $1"; tail -1 "$LOG"; exit 4; fi
  say "front ok after $1: $(tail -1 "$LOG" | sed 's/.*front=//')"
}

for item in $ITEMS; do
  case $item in
    tz)
      for role in kernel worker; do
        wait_idle "tz-probe $role"
        ssh -o BatchMode=yes mini "set -e; S=\$(mktemp -d /tmp/cua-115-tz.XXXXXX); cd ~/Developer/GitHub/cua-parity; \
          env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin HOME=\$S/home LANG=C.UTF-8 CUA_HOME=$APPROVED ~/cua-115/home/node/24.22.0/bin/node scripts/sandbox-probe/tz-probe.mjs \
          --launcher codex --role $role --runs 80 --bound-ms 15000 --codex $APPROVED/runtimes/26.928.40906-darwin-arm64/CodexCLI.app/Contents/MacOS/codex \
          --node $APPROVED/node/24.22.0/bin/node --out \$S/$role.json >\$S/$role.log 2>&1; echo \$S" > /tmp/cua-115-m0c-tz-$role.dir 2>>"$LOG"
        rc=$?; S=$(cat /tmp/cua-115-m0c-tz-$role.dir)
        mkdir -p "$E/tz-probe"; scp -q "mini:$S/$role.json" "mini:$S/$role.log" "$E/tz-probe/" 2>>"$LOG"
        ssh -o BatchMode=yes mini "rm -rf $S"
        say "tz-probe $role exit=$rc"
        front "tz-probe $role"
      done ;;
    native-prepare)
      node scripts/native-baseline.mjs prepare --device mini --commit "$COMMIT" >>"$LOG" 2>&1 || { say "STOP: native-baseline prepare failed"; exit 5; }
      say "native-baseline prepared at $COMMIT" ;;
    vendor)
      for n in 1 2 3; do
        [ -e "$E/mini-vendor-computer/run-$n/meta.json" ] && continue
        wait_idle "vendor computer run-$n"
        say "vendor computer run-$n start; controller: $(uptime)"
        node scripts/native-baseline.mjs run --device mini --experiment 115-m0 --host vendor --approved-runtime "$APPROVED" --out "$E/mini-vendor-computer/run-$n" >/tmp/cua-115-m0c-mini-vendor-$n.log 2>&1
        say "vendor computer run-$n exit=$?: $(tail -1 /tmp/cua-115-m0c-mini-vendor-$n.log)"
        front "vendor computer run-$n"
      done ;;
    browser)
      for n in 1 2 3; do
        [ -e "$E/mini-cua-browser/run-$n/meta.json" ] && continue
        wait_idle "cua browser run-$n"
        say "cua browser run-$n start; controller: $(uptime)"
        node scripts/native-baseline.mjs run --device mini --experiment 115-m0 --host cua --surfaces browser --out "$E/mini-cua-browser/run-$n" >/tmp/cua-115-m0c-mini-browser-$n.log 2>&1
        say "cua browser run-$n exit=$?: $(tail -1 /tmp/cua-115-m0c-mini-browser-$n.log)"
        front "cua browser run-$n"
      done ;;
    accept)
      wait_idle "accept-native on main"
      say "accept-native on main 94366c1 start"
      ssh -o BatchMode=yes mini 'bash -s' >/tmp/cua-115-m0c-accept.log 2>&1 <<'REMOTE'
set -u
C=$HOME/cua-115-accept-main
test -d "$C/.git" || git clone -q https://github.com/SSFSKIM/cua "$C"
cd "$C" && git fetch -q origin main && git checkout -q --detach 94366c1 && test -z "$(git status --porcelain)" && npm ci --silent --no-audit --no-fund || exit 10
cd "$HOME/Developer/GitHub/cua-parity" || exit 11
P=$(node scripts/native-baseline/prepare.mjs prepare '{"device":"mini","approvedHome":"/Users/new/cua-115/home"}') || exit 12
echo "prepared: $P"
CONFIG=$(node -e 'console.log(JSON.parse(process.argv[1]).configHome)' "$P")
SCRATCH=$(node -e 'console.log(JSON.parse(process.argv[1]).scratch)' "$P")
cd "$C"
env -i PATH="$PATH" HOME="$HOME" USER="$USER" LOGNAME="$LOGNAME" TMPDIR="$TMPDIR" LANG=C.UTF-8 XDG_CONFIG_HOME="$CONFIG" CUA_HOME=/Users/new/cua-115/home \
  node scripts/accept-native.mjs --live-secrets --live-textedit --report "$SCRATCH/acceptance.json"
rc=$?
echo "accept-native exit=$rc"
mkdir -p "$HOME/cua-115-accept-out" && cp "$SCRATCH/acceptance.json" "$HOME/cua-115-accept-out/acceptance.json"
cd "$HOME/Developer/GitHub/cua-parity" && node scripts/native-baseline/prepare.mjs cleanup "$P"
exit $rc
REMOTE
      rc=$?
      mkdir -p "$E/accept-native-main"
      scp -q mini:cua-115-accept-out/acceptance.json "$E/accept-native-main/acceptance.json" 2>>"$LOG"
      cp /tmp/cua-115-m0c-accept.log "$E/accept-native-main/run.log"
      say "accept-native on main exit=$rc"
      front "accept-native on main" ;;
  esac
done
say "sequence done: $ITEMS"
