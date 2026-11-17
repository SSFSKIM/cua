#!/bin/bash
# task 89: every part of H's local proof (local-proof.sh), one after another, each its own locked hold (holder t5-x64)
# with its own timeout; logs in task89/proof/<part>.log, one line per part in proof/proof.log. Every part runs whatever
# an earlier one did, so the record is whole; any nonzero exit stops the counted run (the brief).
T=/Users/new/.local/share/cua-171/task89
W=/Users/new/Developer/GitHub/cua/.claude/worktrees
L=/Users/new/.local/share/cua-171/locked.sh
P=$T/proof
mkdir -p "$P"
run() {  # <name> <timeout> <part> [args]
  local name=$1 to=$2; shift 2
  [ -e /Users/new/.local/share/cua-171/hold-sittings ] && { echo "$(date -u +%FT%TZ) hold-sittings present: $name not run" >> "$P/proof.log"; return; }
  "$L" t5-x64 timeout -s TERM -k 120 "$to" "$T/local-proof.sh" "$@" > "$P/$name.log" 2>&1
  echo "$(date -u +%FT%TZ) $name exit $?" >> "$P/proof.log"
}
run npm-test-H 30m npm-test "$W/t5-x64" H
run npm-test-main 30m npm-test "$W/t5-main" main
run harness 45m harness
run harness-dbus 15m harness-dbus
run engine-static 45m engine-static
run engine-live 45m engine-live
run two-screens 30m two-screens
echo "$(date -u +%FT%TZ) proof done" >> "$P/proof.log"
