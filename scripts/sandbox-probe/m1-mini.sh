#!/bin/sh
# #115 M1's mini runs, each one command from this checkout on the controller, under the mini's rules:
#
#   node scripts/mini-rules.mjs gated -- sh scripts/sandbox-probe/m1-mini.sh oracles <sha>
#   node scripts/mini-rules.mjs gated -- sh scripts/sandbox-probe/m1-mini.sh own-sandbox <sha>
#   node scripts/mini-rules.mjs gated -- sh scripts/sandbox-probe/m1-mini.sh cfprefs <before-sha> <after-sha> <harness profile>
#
# oracles      in the scratch tree ~/cua-115/repo checked out at <sha>: the fingerprint under cua's launcher (kernel and
#              worker roles, scoped and default) against M0's golden-kernel and signed-CLI fingerprints, and cua's port
#              rendering M0's two argv captures (oracle.mjs fingerprint --launcher cua, port-vs-capture,
#              compare-fingerprints). Each kernel fingerprint also pins the port's metadata grant (compare.mjs
#              metadataGrantPins: the cua home and its run/ metadata only, another session's run/<id> nothing) and fails
#              the item if it does not hold. Against M0's golden kernel the cua kernel differs by that grant (metadata on
#              cua-home) and the new cua-home/run target, by design. Non-GUI: plain probes under sandbox-exec on the
#              approved home and the scratch HOME.
# own-sandbox  scripts/accept/own-sandbox.mjs on the approved home (cua's own host, browser surface only, no helper, no
#              GUI): acceptance 1-5 for the own host on macOS.
# cfprefs      the #116 cells and services suites on cua's own host at <before-sha> (today's profile, the Codex CLI's)
#              and at <after-sha> (cua's kernel profile), each under `log stream` for sandbox denials, reduced and
#              compared by denials.mjs. It prepares repl-parity on the mini with <harness profile>, whose browser lanes
#              use a harness Chrome: GUI-bound.
#
# Results land in docs/evidence/2026-10-17-own-sandbox/m1/<item>/. Nothing runs under the account's real HOME except
# the cfprefs suites' repl-parity preparation, as the parity harness itself does.
set -eu
E=docs/evidence/2026-10-17-own-sandbox/m1
item=${1:?item: oracles, own-sandbox or cfprefs}
remote() { ssh -o BatchMode=yes mini "$1"; }
checkout() { remote "cd ~/cua-115/repo && git fetch -q origin && git checkout -q --detach $1 && npm ci --silent --no-audit --no-fund"; }

case "$item" in
oracles)
  sha=${2:?sha}; checkout "$sha"; mkdir -p "$E/oracles"
  remote 'test -x ~/cua-115/bin-cua-fp || (cd ~/cua-115/repo && SDKROOT=/Applications/Xcode.app/Contents/Developer/Platforms/MacOSX.platform/Developer/SDKs/MacOSX.sdk xcrun clang -O2 -Wall -o ~/cua-115/bin-cua-fp scripts/sandbox-probe/fingerprint.c)'
  remote 'rm -rf ~/cua-115/m1-oracles && mkdir -p ~/cua-115/m1-oracles'
  M0=docs/evidence/2026-10-17-own-sandbox/m0
  for mode in scoped default; do
    for role in kernel worker; do
      remote "cd ~/cua-115/repo && node scripts/sandbox-probe/oracle.mjs fingerprint --home ~/cua-115/home --user-home ~/cua-115/userhome --mode $mode --launcher cua --role $role --fp ~/cua-115/bin-cua-fp --out ~/cua-115/m1-oracles/fp-cua-$role-$mode.json"
    done
    remote "cd ~/cua-115/repo && node scripts/sandbox-probe/oracle.mjs compare-fingerprints $M0/fingerprint/fp-golden-kernel-$mode.json ~/cua-115/m1-oracles/fp-cua-kernel-$mode.json --out ~/cua-115/m1-oracles/fp-compare-golden-kernel-cua-kernel-$mode.json >/dev/null"
    remote "cd ~/cua-115/repo && node scripts/sandbox-probe/oracle.mjs compare-fingerprints $M0/fingerprint/fp-signed-$mode.json ~/cua-115/m1-oracles/fp-cua-worker-$mode.json --out ~/cua-115/m1-oracles/fp-compare-signed-cua-worker-$mode.json >/dev/null"
    remote "cd ~/cua-115/repo && node scripts/sandbox-probe/oracle.mjs port-vs-capture --capture $M0/argv-capture/capture-signed-$mode.json --out ~/cua-115/m1-oracles/port-vs-signed-$mode.json"
  done
  scp -q 'mini:~/cua-115/m1-oracles/*.json' "$E/oracles/"
  ;;
own-sandbox)
  sha=${2:?sha}; checkout "$sha"; mkdir -p "$E/own-sandbox"
  remote 'cd ~/cua-115/repo && node scripts/accept/own-sandbox.mjs --home ~/cua-115/home --out ~/cua-115/m1-own-sandbox.json' || status=$?
  scp -q 'mini:~/cua-115/m1-own-sandbox.json' "$E/own-sandbox/own-sandbox.json"
  exit "${status:-0}"
  ;;
cfprefs)
  before=${2:?before sha}; after=${3:?after sha}; profile=${4:?harness profile}; mkdir -p "$E/cfprefs"
  for side in before after; do
    if [ "$side" = before ]; then sha=$before; else sha=$after; fi
    node scripts/repl-parity.mjs prepare --device mini --commit "$sha" --profile "$profile" >/dev/null
    remote "rm -f /tmp/cua115-denials-$side.ndjson; nohup log stream --style ndjson --predicate 'sender == \"Sandbox\"' > /tmp/cua115-denials-$side.ndjson 2>/dev/null & echo \$! > /tmp/cua115-denials-$side.pid"
    for suite in cells services; do
      node scripts/repl-parity.mjs run --device mini --host cua --suite "$suite" --out "$E/cfprefs/$side-$suite" || echo "$side $suite: exit $?"
    done
    remote "kill \$(cat /tmp/cua115-denials-$side.pid); rm -f /tmp/cua115-denials-$side.pid"
    scp -q "mini:/tmp/cua115-denials-$side.ndjson" "/tmp/cua115-denials-$side.ndjson"
    remote "rm -f /tmp/cua115-denials-$side.ndjson"
    node scripts/repl-parity.mjs cleanup-prepared --device mini >/dev/null
  done
  # Only the reduction is kept: the raw log names every sandboxed process on the mini.
  node scripts/sandbox-probe/denials.mjs summarize /tmp/cua115-denials-before.ndjson /tmp/cua115-denials-after.ndjson --out "$E/cfprefs/denials.json" >/dev/null
  rm -f /tmp/cua115-denials-before.ndjson /tmp/cua115-denials-after.ndjson
  for suite in cells services; do
    node scripts/repl-parity.mjs diff "$E/cfprefs/before-$suite" "$E/cfprefs/after-$suite" > "$E/cfprefs/diff-$suite.json" || echo "diff $suite: exit $?"
  done
  ;;
*) echo "unknown item $item" >&2; exit 2 ;;
esac
