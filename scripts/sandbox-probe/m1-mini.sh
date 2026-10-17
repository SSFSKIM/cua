#!/bin/sh
# #115 M1's mini runs, each one command from this checkout on the controller, under the mini's rules:
#
#   node scripts/mini-rules.mjs gated -- sh scripts/sandbox-probe/m1-mini.sh oracles <sha>
#   node scripts/mini-rules.mjs gated -- sh scripts/sandbox-probe/m1-mini.sh own-sandbox <sha>
#   node scripts/mini-rules.mjs gated -- sh scripts/sandbox-probe/m1-mini.sh cfprefs <before-sha> <after-sha> <harness profile>
#
# oracles      in the scratch tree ~/cua-115/repo checked out at <sha>: the fingerprint under cua's launcher (kernel and
#              worker roles, scoped and default) against M0's golden-kernel and signed-CLI fingerprints, and cua's port
#              rendering M0's two argv captures (oracle.mjs fingerprint --launcher cua, compare-fingerprints --expect,
#              port-vs-capture). Each kernel fingerprint also pins the port's metadata grant (compare.mjs
#              metadataGrantPins: the cua home and its run/ metadata only, another session's run/<id> nothing); each
#              fingerprint comparison is judged against its declared deviations (compare.mjs judgeFingerprints), and
#              the port's rendering against the capture's (equalButDeviations). Non-GUI: plain probes under sandbox-exec
#              on the approved home and the scratch HOME.
# own-sandbox  scripts/accept/own-sandbox.mjs on the approved home (cua's own host, browser surface only, no helper, no
#              GUI): acceptance 1-5 for the own host on macOS.
# cfprefs      the #116 cells and services suites on cua's own host at <before-sha> (today's profile, the Codex CLI's)
#              and at <after-sha> (cua's kernel profile), each under `log stream` for sandbox denials, reduced and
#              compared by denials.mjs, and each suite's two sides compared (m1-judge.mjs before-after: equal but for the
#              kernel exit status). It prepares repl-parity on the mini with <harness profile>, whose browser lanes use
#              a harness Chrome: GUI-bound.
#
# Every step runs, and its evidence is collected, even after an earlier one failed; the item then exits 1 naming each
# failed step: a run that fails or stays incomplete, a pin that does not hold, a comparison beyond its declared
# deviations. Results land in $M1_MINI_EVIDENCE (default docs/evidence/2026-10-17-own-sandbox/m1)/<item>/. Nothing runs
# under the account's real HOME except the cfprefs suites' repl-parity preparation, as the parity harness itself does.
set -eu
E=${M1_MINI_EVIDENCE:-docs/evidence/2026-10-17-own-sandbox/m1}
# Where the denial logs are copied on this machine before they are reduced (and removed).
L=${M1_MINI_SCRATCH:-/tmp}
item=${1:?item: oracles, own-sandbox or cfprefs}
remote() { ssh -o BatchMode=yes mini "$1"; }
checkout() { remote "cd ~/cua-115/repo && git fetch -q origin && git checkout -q --detach $1 && npm ci --silent --no-audit --no-fund"; }

failed=0
# One step: a failure is counted and named, never the end of the item.
step() {
  label=$1; shift
  if "$@"; then :; else echo "m1-mini $item: FAILED: $label (exit $?)" >&2; failed=$((failed + 1)); fi
}
missing() { echo "m1-mini $item: FAILED: $1" >&2; failed=$((failed + 1)); }
finish() {
  if [ "$failed" -gt 0 ]; then echo "m1-mini $item: $failed step(s) failed; the evidence is in $E/$item" >&2; exit 1; fi
  echo "m1-mini $item: every step passed; the evidence is in $E/$item" >&2
}

case "$item" in
oracles)
  sha=${2:?sha}; checkout "$sha"; mkdir -p "$E/oracles"
  remote 'test -x ~/cua-115/bin-cua-fp || (cd ~/cua-115/repo && SDKROOT=/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk xcrun clang -O2 -Wall -o ~/cua-115/bin-cua-fp scripts/sandbox-probe/fingerprint.c)'
  remote 'rm -rf ~/cua-115/m1-oracles && mkdir -p ~/cua-115/m1-oracles'
  M0=docs/evidence/2026-10-17-own-sandbox/m0
  O='~/cua-115/m1-oracles'
  for mode in scoped default; do
    for role in kernel worker; do
      step "fingerprint cua-$role $mode" remote "cd ~/cua-115/repo && node scripts/sandbox-probe/oracle.mjs fingerprint --home ~/cua-115/home --user-home ~/cua-115/userhome --mode $mode --launcher cua --role $role --fp ~/cua-115/bin-cua-fp --out $O/fp-cua-$role-$mode.json"
    done
    step "golden kernel vs cua kernel, $mode" remote "cd ~/cua-115/repo && node scripts/sandbox-probe/oracle.mjs compare-fingerprints $M0/fingerprint/fp-golden-kernel-$mode.json $O/fp-cua-kernel-$mode.json --expect golden-kernel/cua-kernel --out $O/fp-compare-golden-kernel-cua-kernel-$mode.json >/dev/null"
    step "signed CLI vs cua worker, $mode" remote "cd ~/cua-115/repo && node scripts/sandbox-probe/oracle.mjs compare-fingerprints $M0/fingerprint/fp-signed-$mode.json $O/fp-cua-worker-$mode.json --expect signed/cua-worker --out $O/fp-compare-signed-cua-worker-$mode.json >/dev/null"
    step "port vs signed capture, $mode" remote "cd ~/cua-115/repo && node scripts/sandbox-probe/oracle.mjs port-vs-capture --capture $M0/argv-capture/capture-signed-$mode.json --out $O/port-vs-signed-$mode.json"
  done
  step "collect the oracles' evidence" scp -q 'mini:~/cua-115/m1-oracles/*.json' "$E/oracles/"
  finish
  ;;
own-sandbox)
  sha=${2:?sha}; checkout "$sha"; mkdir -p "$E/own-sandbox"
  step "own-sandbox check" remote 'cd ~/cua-115/repo && node scripts/accept/own-sandbox.mjs --home ~/cua-115/home --out ~/cua-115/m1-own-sandbox.json'
  step "collect the check's report" scp -q 'mini:~/cua-115/m1-own-sandbox.json' "$E/own-sandbox/own-sandbox.json"
  finish
  ;;
cfprefs)
  before=${2:?before sha}; after=${3:?after sha}; profile=${4:?harness profile}; mkdir -p "$E/cfprefs"
  # GUI-bound: the suites pause at their next cell while MAWS CI's mac lane is busy or has a macOS job queued (MAWS DL 58).
  # The watcher runs here, from this checkout, whichever commit a side prepares on the mini; it is this item's own
  # process, ended with it. Its log is evidence; each run's pauses are in its meta.json.
  PAUSE="$L/cua115-cfprefs-pause.json"
  rm -f "$PAUSE"
  ${M1_MINI_PAUSE_WATCH:-node scripts/mini-pause.mjs} watch --file "$PAUSE" --log "$E/cfprefs/pauses.log" &
  WATCHER=$!
  trap 'status=$?; kill "$WATCHER" 2>/dev/null || true; wait "$WATCHER" 2>/dev/null || true; exit $status' EXIT
  for side in before after; do
    if [ "$side" = before ]; then sha=$before; else sha=$after; fi
    if node scripts/repl-parity.mjs prepare --device mini --commit "$sha" --profile "$profile" >/dev/null; then
      step "$side: start the denial log" remote "rm -f /tmp/cua115-denials-$side.ndjson; nohup log stream --style ndjson --predicate 'sender == \"Sandbox\"' > /tmp/cua115-denials-$side.ndjson 2>/dev/null & echo \$! > /tmp/cua115-denials-$side.pid"
      for suite in cells services; do
        step "$side $suite run" node scripts/repl-parity.mjs run --device mini --host cua --suite "$suite" --out "$E/cfprefs/$side-$suite" --pause-file "$PAUSE"
      done
      step "$side: stop the denial log" remote "kill \$(cat /tmp/cua115-denials-$side.pid); rm -f /tmp/cua115-denials-$side.pid"
      step "$side: collect the denial log" scp -q "mini:/tmp/cua115-denials-$side.ndjson" "$L/cua115-denials-$side.ndjson"
      remote "rm -f /tmp/cua115-denials-$side.ndjson" || true
    else
      missing "$side: prepare at $sha"
    fi
    step "$side: cleanup-prepared" node scripts/repl-parity.mjs cleanup-prepared --device mini
  done
  # Only the reduction is kept: the raw log names every sandboxed process on the mini.
  if [ -f "$L/cua115-denials-before.ndjson" ] && [ -f "$L/cua115-denials-after.ndjson" ]; then
    step "reduce the denials" node scripts/sandbox-probe/denials.mjs summarize "$L/cua115-denials-before.ndjson" "$L/cua115-denials-after.ndjson" --out "$E/cfprefs/denials.json"
  else
    missing "a side's denial log is missing"
  fi
  rm -f "$L/cua115-denials-before.ndjson" "$L/cua115-denials-after.ndjson"
  for suite in cells services; do
    if [ -f "$E/cfprefs/before-$suite/meta.json" ] && [ -f "$E/cfprefs/after-$suite/meta.json" ]; then
      node scripts/repl-parity.mjs diff "$E/cfprefs/before-$suite" "$E/cfprefs/after-$suite" > "$E/cfprefs/diff-$suite.json" || true
      step "before vs after, $suite" node scripts/sandbox-probe/m1-judge.mjs before-after "$E/cfprefs/diff-$suite.json" "$E/cfprefs/before-$suite" "$E/cfprefs/after-$suite"
    else
      missing "before vs after, $suite: a side has no run"
    fi
  done
  finish
  ;;
*) echo "unknown item $item" >&2; exit 2 ;;
esac
