#!/bin/sh
# #115 M2's mini runs, each one command from this checkout on the controller, under the mini's rules:
#
#   node scripts/mini-rules.mjs gated -- sh scripts/sandbox-probe/m2-mini.sh env-probe <sha>
#   node scripts/mini-rules.mjs gated -- sh scripts/sandbox-probe/m2-mini.sh helper-tmp <sha>
#
# env-probe   M2's first step (spec, Plan of Work M2): in the scratch tree ~/cua-115/repo checked out at <sha>, a vendor-
#             host computer session per mode (scoped, default, disabled) through experiment.mjs --env-probe, with
#             CODEX_CLI_PATH pointed at a slot in front of the approved home's signed CLI: one banner cell, no native
#             call, a scratch HOME (~/cua-115/userhome). Judged by launch-env.mjs: each child's `sandbox` call must carry
#             TMPDIR and CODEX_HOME exactly as buildLaunch set them (scoped and default); under disabled it records whether
#             node_repl calls the launcher at all. No GUI, no helper (the run refuses to start while one runs).
# helper-tmp  M2's helper check (spec, M2 "Decisions here"): a vendor-host computer session (scoped) through
#             experiment.mjs --native --watch-session-tmp, the approved home's helper copy served in place, the account's
#             real HOME with a scratch XDG_CONFIG_HOME (as M0's native runs): the six read-only native calls and one
#             Finder screenshot (sizes and counts only), and after each, what lies under the session temp besides
#             node_repl's scripts and what the run's own helper holds open there. Exits 1 when the helper writes there.
#             Native: the approved helper captures the screen (no input events); refuses to start while any helper runs.
#
# Every step runs, and its evidence is collected, even after an earlier one failed; the item then exits 1 naming each
# failed step. Results land in $M2_MINI_EVIDENCE (default docs/evidence/2026-10-17-own-sandbox/m2)/<item>/.
set -eu
E=${M2_MINI_EVIDENCE:-docs/evidence/2026-10-17-own-sandbox/m2}
item=${1:?item: env-probe or helper-tmp}
remote() { ssh -o BatchMode=yes mini "$1"; }
# A revision reaches the mini's shell source (checkout): a 7-40 digit lowercase hex commit id only.
revision() {
  case $1 in *[!0-9a-f]*|'') echo "m2-mini $item: refused: $1 is not a commit id (7-40 lowercase hex digits)" >&2; exit 2;; esac
  if [ ${#1} -lt 7 ] || [ ${#1} -gt 40 ]; then echo "m2-mini $item: refused: $1 is not a commit id (7-40 lowercase hex digits)" >&2; exit 2; fi
}
checkout() { remote "cd ~/cua-115/repo && git fetch -q origin && git checkout -q --detach $1 && npm ci --silent --no-audit --no-fund"; }

failed=0
step() {
  label=$1; shift
  if "$@"; then :; else echo "m2-mini $item: FAILED: $label (exit $?)" >&2; failed=$((failed + 1)); fi
}
finish() {
  if [ "$failed" -gt 0 ]; then echo "m2-mini $item: $failed step(s) failed; the evidence is in $E/$item" >&2; exit 1; fi
  echo "m2-mini $item: every step passed; the evidence is in $E/$item" >&2
}

SIGNED_CLI='~/cua-115/home/runtimes/26.928.40906-darwin-arm64/CodexCLI.app/Contents/MacOS/codex'

case "$item" in
env-probe)
  sha=${2:?sha}; revision "$sha"; checkout "$sha"; mkdir -p "$E/env-probe"
  O='~/cua-115/m2-env-probe'
  remote "rm -rf $O && mkdir -p $O ~/cua-115/scratch"
  for mode in scoped default disabled; do
    step "env probe, $mode" remote "cd ~/cua-115/repo && node scripts/sandbox-probe/experiment.mjs --env-probe --home ~/cua-115/home --user-home ~/cua-115/userhome --scratch ~/cua-115/scratch --host vendor --mode $mode --cli $SIGNED_CLI --app-server forward --label m2-env-$mode --out $O/env-$mode.json"
  done
  step "collect the probe's evidence" scp -q "mini:$O/*.json" "$E/env-probe/"
  finish
  ;;
helper-tmp)
  sha=${2:?sha}; revision "$sha"; checkout "$sha"; mkdir -p "$E/helper-tmp"
  O='~/cua-115/m2-helper-tmp'
  remote "rm -rf $O && mkdir -p $O ~/cua-115/scratch"
  step "helper check" remote "cd ~/cua-115/repo && node scripts/sandbox-probe/experiment.mjs --native --watch-session-tmp --home ~/cua-115/home --user-home \"\$HOME\" --config-home ~/cua-115/userhome/.config --scratch ~/cua-115/scratch --host vendor --mode scoped --cli $SIGNED_CLI --app-server forward --label m2-helper-tmp --out $O/helper-tmp.json"
  step "collect the check's evidence" scp -q "mini:$O/helper-tmp.json" "$E/helper-tmp/"
  if [ -f "$E/helper-tmp/helper-tmp.json" ]; then
    step "the helper does not write under the session temp" node -e 'const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); const v = r.sessionTmp?.verdict; console.error(JSON.stringify(v)); process.exit(v && v.writes === false && v.observations > 0 ? 0 : 1)' "$E/helper-tmp/helper-tmp.json"
  fi
  finish
  ;;
*) echo "unknown item $item" >&2; exit 2 ;;
esac
