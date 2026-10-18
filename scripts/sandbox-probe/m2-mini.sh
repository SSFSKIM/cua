#!/bin/sh
# #115 M2's mini runs, each one command from this checkout on the controller, under the mini's rules:
#
#   node scripts/mini-rules.mjs gated -- sh scripts/sandbox-probe/m2-mini.sh env-probe <sha>
#   node scripts/mini-rules.mjs gated -- sh scripts/sandbox-probe/m2-mini.sh helper-tmp <sha>
#   node scripts/mini-rules.mjs gated -- sh scripts/sandbox-probe/m2-mini.sh headless <sha>
#   node scripts/mini-rules.mjs gated -- sh scripts/sandbox-probe/m2-mini.sh parity <sha> <harness profile>
#   node scripts/mini-rules.mjs gated --pause --mirror <path on the mini> -- sh scripts/sandbox-probe/m2-mini.sh accept <sha>
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
# headless    M2's non-GUI acceptance on the approved home, at <sha> in ~/cua-115/repo: own-sandbox.mjs --host vendor
#             (acceptance 2 to 5 on the vendor host through the compat executable: the deny list, the kernel's own TMPDIR,
#             the script directory, links, network, two concurrent sessions) and --host cua (item 11 again, bin/ now
#             trusted code); `cua doctor --json` on the approved home under the scratch HOME (sandbox.launcher pass, no row
#             naming the Codex CLI); and on the vendor's own pinned Node, the compat's unit tests and how its
#             process.execve fails (thrown or aborted). No helper, no GUI.
# parity      acceptance 12 on the mini: repl-parity's vendor host against cua's own host, --suite all, both now under
#             cua's sandbox, diffed against the expected differences (kernel-exit-status retired). GUI-bound (the browser
#             lanes drive a harness Chrome): its cells pause while MAWS CI's mac lane is busy or has a macOS job queued
#             (MAWS DL 58, a watcher of this item's own). The longest group: a long quiet window.
# accept      the TextEdit sitting (the owner standing by): accept-native --live-secrets --live-textedit at <sha> in its
#             own scratch clone ~/cua-115-accept-m2, serving the approved home through native-baseline's approved-runtime
#             preparation and cleanup, run from the prepared parity clone ~/Developer/GitHub/cua-parity as mini-rules.mjs's
#             ACCEPT_REMOTE runs them (prepare refuses anywhere else), with the preparation's TMPDIR and XDG_CONFIG_HOME;
#             CUA_PAUSE_FILE (mini-rules gated --pause --mirror) reaches it. Items 11 to 13 are #115's (13, the compat
#             route, is acceptance 6: native calls through the compat executable's app-server). Report in
#             $E/accept/acceptance.json; exits 1 unless accept-native and the cleanup both report (0 or 3) and 0.
#
# Every step runs, and its evidence is collected, even after an earlier one failed; the item then exits 1 naming each
# failed step. Results land in $M2_MINI_EVIDENCE (default docs/evidence/2026-10-17-own-sandbox/m2)/<item>/.
set -eu
E=${M2_MINI_EVIDENCE:-docs/evidence/2026-10-17-own-sandbox/m2}
item=${1:?item: env-probe, helper-tmp, headless, parity or accept}
# Where the parity watcher's pause file goes on this machine.
L=${M2_MINI_SCRATCH:-/tmp}
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
VENDOR_NODE='~/cua-115/home/runtimes/26.928.40906-darwin-arm64/cua_node/bin/node'

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
headless)
  sha=${2:?sha}; revision "$sha"; checkout "$sha"; mkdir -p "$E/headless"
  O='~/cua-115/m2-headless'
  remote "rm -rf $O && mkdir -p $O"
  step "own-sandbox, vendor host" remote "cd ~/cua-115/repo && node scripts/accept/own-sandbox.mjs --home ~/cua-115/home --host vendor --out $O/own-sandbox-vendor.json"
  step "own-sandbox, cua's own host" remote "cd ~/cua-115/repo && node scripts/accept/own-sandbox.mjs --home ~/cua-115/home --host cua --out $O/own-sandbox-cua.json"
  step "doctor" remote "cd ~/cua-115/repo && env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin:\$(dirname \$(command -v node)) HOME=\$HOME/cua-115/userhome XDG_CONFIG_HOME=\$HOME/cua-115/userhome/.config CUA_HOME=\$HOME/cua-115/home LANG=C.UTF-8 node bin/cua.mjs doctor --json > $O/doctor.json; node -e 'const r = JSON.parse(require(\"fs\").readFileSync(process.argv[1], \"utf8\")); const row = r.checks.find(c => c.name === \"sandbox.launcher\"); const named = JSON.stringify(r).includes(\"codexCli\") || JSON.stringify(r).includes(\"CodexCLI\"); console.error(JSON.stringify({launcher: row?.status, codexNamed: named})); process.exit(row?.status === \"pass\" && !named ? 0 : 1)' $O/doctor.json"
  step "the compat's unit tests on the vendor's Node" remote "cd ~/cua-115/repo && $VENDOR_NODE --version > $O/vendor-node.txt && $VENDOR_NODE --test test/sandbox/codex-compat.test.mjs test/sandbox/app-server.test.mjs test/sandbox/compat-wrapper.test.mjs > $O/vendor-node-tests.txt 2>&1"
  step "how process.execve fails on the vendor's Node" remote "$VENDOR_NODE --disable-warning=ExperimentalWarning -e 'try { process.execve(\"/nonexistent/cua-m2\", [\"/nonexistent/cua-m2\"], {}); } catch (e) { console.log(\"throws \" + e.code); }' > $O/vendor-node-execve.txt 2>&1; echo \"exit \$?\" >> $O/vendor-node-execve.txt; head -c 300 $O/vendor-node-execve.txt >&2; true"
  step "collect the evidence" scp -q "mini:$O/*" "$E/headless/"
  finish
  ;;
parity)
  sha=${2:?sha}; profile=${3:?harness profile}; revision "$sha"; mkdir -p "$E/parity"
  # GUI-bound: the suites pause at their next cell while MAWS CI's mac lane is busy or has a macOS job queued (MAWS DL 58).
  # The watcher is this item's own process, ended with it; the pause file and its heartbeat are removed only then.
  PAUSE="$L/cua115-m2-parity-pause.json"
  rm -f "$PAUSE" "$PAUSE.alive"
  ${M2_MINI_PAUSE_WATCH:-node scripts/mini-pause.mjs} watch --file "$PAUSE" --log "$E/parity/pauses.log" &
  WATCHER=$!
  trap 'status=$?; kill "$WATCHER" 2>/dev/null || true; wait "$WATCHER" 2>/dev/null || true; rm -f "$PAUSE" "$PAUSE.alive"; exit $status' EXIT
  n=0; while [ ! -e "$PAUSE.alive" ] && [ "$n" -lt 120 ]; do sleep 0.5; n=$((n + 1)); done
  [ -e "$PAUSE.alive" ] || { echo "m2-mini $item: FAILED: the pause watcher never started" >&2; exit 1; }
  if node scripts/repl-parity.mjs prepare --device mini --commit "$sha" --profile "$profile" >/dev/null; then
    for host in vendor cua; do
      step "$host run" node scripts/repl-parity.mjs run --device mini --host "$host" --suite all --out "$E/parity/mini-$host" --pause-file "$PAUSE"
    done
  else
    echo "m2-mini $item: FAILED: prepare at $sha" >&2; failed=$((failed + 1))
  fi
  step "cleanup-prepared" node scripts/repl-parity.mjs cleanup-prepared --device mini
  if [ -f "$E/parity/mini-vendor/meta.json" ] && [ -f "$E/parity/mini-cua/meta.json" ]; then
    node scripts/repl-parity.mjs diff "$E/parity/mini-vendor" "$E/parity/mini-cua" --expected test/repl-parity/expected-differences.json > "$E/parity/diff.json" || true
    step "vendor host against cua's own host: no unexpected difference" node -e 'const d = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); console.error(JSON.stringify({ok: d.ok, differences: d.differences?.length})); process.exit(d.ok === true && Array.isArray(d.differences) && d.differences.length === 0 ? 0 : 1)' "$E/parity/diff.json"
  else
    echo "m2-mini $item: FAILED: a side has no run" >&2; failed=$((failed + 1))
  fi
  finish
  ;;
accept)
  sha=${2:?sha}; revision "$sha"; mkdir -p "$E/accept"
  if [ -e "$E/accept/acceptance.json" ]; then echo "m2-mini $item: refused: $E/accept/acceptance.json already exists; move it aside first" >&2; exit 2; fi
  pause=${CUA_PAUSE_FILE:-}
  case $pause in *[!A-Za-z0-9._/-]*) echo "m2-mini $item: refused: CUA_PAUSE_FILE is not a plain path" >&2; exit 2;; esac
  text=$(sed -e "s/@SHA@/$sha/g" -e "s#@PAUSE@#$pause#g" <<'REMOTE' | ssh -o BatchMode=yes mini 'bash -s'
set -u
C=$HOME/cua-115-accept-m2
test -d "$C/.git" || git clone -q https://github.com/SSFSKIM/cua "$C" || exit 80
cd "$C" && git fetch -q origin && git checkout -q --detach @SHA@ && test -z "$(git status --porcelain)" && npm ci --silent --no-audit --no-fund || exit 81
OUT=$(mktemp -d /tmp/cua-115-accept-m2.XXXXXX) || exit 82
cd "$HOME/Developer/GitHub/cua-parity" || exit 83
P=$(node scripts/native-baseline/prepare.mjs prepare '{"device":"mini","approvedHome":"/Users/new/cua-115/home"}') || exit 84
CONFIG=$(node -e 'const p = JSON.parse(process.argv[1]); if (!p.configHome) process.exit(1); console.log(p.configHome)' "$P") || exit 85
RUN_TMP=$(node -e 'const p = JSON.parse(process.argv[1]); if (!p.tmpdir) process.exit(1); console.log(p.tmpdir)' "$P") || exit 86
cd "$C"
env -i PATH="$PATH" HOME="$HOME" USER="$USER" LOGNAME="$LOGNAME" TMPDIR="$RUN_TMP" LANG=C.UTF-8 XDG_CONFIG_HOME="$CONFIG" CUA_HOME=/Users/new/cua-115/home CUA_PAUSE_FILE="@PAUSE@" \
  node scripts/accept-native.mjs --live-secrets --live-textedit --report "$OUT/acceptance.json"
ACCEPT=$?
cd "$HOME/Developer/GitHub/cua-parity" && node scripts/native-baseline/prepare.mjs cleanup "$P"
CLEANUP=$?
echo "ACCEPT $ACCEPT CLEANUP $CLEANUP OUT $OUT"
REMOTE
) || true
  line=$(printf '%s\n' "$text" | grep -E '^ACCEPT [0-9]+ CLEANUP [0-9]+ OUT /tmp/cua-115-accept-m2\.[A-Za-z0-9]+$' | tail -1)
  if [ -z "$line" ]; then echo "m2-mini $item: FAILED: the remote run printed no result line (it stopped before acceptance)" >&2; exit 1; fi
  set -- $line
  echo "m2-mini $item: accept-native exit $2 (0 PASS, 1 FAIL, 3 BLOCKED), cleanup exit $4, report in mini:$6" >&2
  step "collect the report" scp -q "mini:$6/acceptance.json" "$E/accept/acceptance.json"
  [ "$4" = 0 ] || { echo "m2-mini $item: FAILED: the approved home's cleanup (exit $4); see prepare.mjs's recovery message on the mini" >&2; failed=$((failed + 1)); }
  case $2 in 0|3) ;; *) echo "m2-mini $item: FAILED: accept-native exited $2" >&2; failed=$((failed + 1));; esac
  finish
  ;;
*) echo "unknown item $item" >&2; exit 2 ;;
esac
