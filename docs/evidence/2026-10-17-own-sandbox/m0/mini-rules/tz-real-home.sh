#!/bin/bash
# tz-probe under the mini account's real HOME (approved 2026-10-17), kernel then worker, each gated by the mini rules.
set -u
W=/Users/new/Developer/GitHub/cua-wt-115-m0b
E=$W/docs/evidence/2026-10-17-own-sandbox/m0
LOG=$E/mini-rules/sitting-log.txt
OUT=$E/tz-probe/real-home
A=/Users/new/cua-115/home
mkdir -p "$OUT"
say() { echo "$(date -u +%FT%TZ) $*" | tee -a "$LOG"; }
front() { ssh -o BatchMode=yes mini 'lsappinfo info -only bundleid "$(lsappinfo front)"' | sed -n 's/.*bundleID="\(.*\)".*/\1/p'; }
gate() {  # waits for an idle window; exits 4 on a non-Terminal frontmost app
  while true; do
    f=$(front)
    [ "$f" = com.apple.Terminal ] || { say "STOP: frontmost is ${f:-unknown} before $1"; exit 4; }
    load=$(ssh -o BatchMode=yes mini uptime | sed -E 's/.*load averages?: ([0-9.]+).*/\1/')
    if awk -v x="$load" 'BEGIN{exit !(x<2)}' && "$E/mini-rules/mini-idle.sh" >>"$LOG" 2>&1; then
      say "idle before $1 (mini 1-min load $load)"; return 0
    fi
    f=$(front); [ "$f" = com.apple.Terminal ] || { say "STOP: frontmost is ${f:-unknown} before $1"; exit 4; }
    say "waiting before $1 (mini 1-min load $load)"; sleep 60
  done
}
for role in kernel worker; do
  gate "tz-probe $role (real HOME)"
  ssh -o BatchMode=yes mini "set -e; S=\$(mktemp -d /tmp/cua-115-tz.XXXXXX); cd ~/Developer/GitHub/cua-parity; \
    env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin HOME=\$HOME LANG=C.UTF-8 CUA_HOME=$A $A/node/24.22.0/bin/node scripts/sandbox-probe/tz-probe.mjs \
    --launcher codex --role $role --runs 80 --bound-ms 15000 --codex $A/runtimes/26.928.40906-darwin-arm64/CodexCLI.app/Contents/MacOS/codex \
    --node $A/node/24.22.0/bin/node --out \$S/$role.json >\$S/$role.log 2>&1; echo \$S" > /tmp/cua-115-m0c-tzr-$role.dir 2>>"$LOG"
  rc=$?; S=$(cat /tmp/cua-115-m0c-tzr-$role.dir)
  scp -q "mini:$S/$role.json" "mini:$S/$role.log" "$OUT/" 2>>"$LOG"; ssh -o BatchMode=yes mini "rm -rf $S"
  say "tz-probe $role (real HOME) exit=$rc"
  f=$(front); say "front after tz-probe $role (real HOME): ${f:-unknown}"
  case "$f" in com.apple.UserNotificationCenter|com.apple.SecurityAgent|com.apple.coreservices.uiagent) say "STOP: system prompt frontmost"; exit 4 ;; esac
done
say "tz-probe real HOME done"
