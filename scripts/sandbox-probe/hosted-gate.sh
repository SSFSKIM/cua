#!/bin/sh
# #159: cua's headless macOS live checks on GitHub's hosted macOS runner, ci-kit's gate `sandbox-live`
# (.github/ci-kit.yml), so a pull request touching the sandbox is proven with no time on the Mac mini. Every check here
# needs neither the owner, nor a TCC grant, nor the mini's own state: no GUI, no native helper, no real secret store.
#
#   sh scripts/sandbox-probe/hosted-gate.sh
#
# On a fresh runner (any Mac works; it refuses elsewhere), in a scratch root it removes at the end:
#   install       `cua install` of the pinned runtime and Node into a scratch CUA_HOME, fetched at run time; the tree
#                 holds no Codex CLI, and `cua doctor`'s sandbox.launcher passes with no row naming one (#115 item 1, 10).
#   oracles       the fingerprint (scripts/sandbox-probe/fingerprint.c) under cua's own launcher, kernel and worker,
#                 scoped and default, judged against M0's golden-kernel and signed-CLI fingerprints with their declared
#                 deviations (each kernel run pins the metadata grant); and cua's port rendering M0's two signed-CLI
#                 argv captures, relocated from the mini's scratch root to this one (oracle.mjs port-vs-capture). As
#                 scripts/sandbox-probe/m1-mini.sh `oracles` ran them on the mini (#115 item 8).
#   own-sandbox   scripts/accept/own-sandbox.mjs on cua's own host and on the vendor host (#115 items 1 to 5).
#   probe-secrets scripts/probe-secrets.mjs against its own synthetic store (#115 items 6 and 7's live roundtrip).
# The golden fixtures and the fail-closed suites run in the unit suite (gate `test`).
#
# Public output: the runner's logs and the reports this writes (uploaded only when the gate fails) carry labels,
# outcomes, counts, booleans and the runner's scratch paths. Every secret is a generated synthetic value that the
# checks keep inside their cells and scan their own reports for; the runtime is never copied out of the scratch root.
# Every step runs and is reported even after an earlier one failed; the gate then exits 1 naming each failed step.
# Reports land in $HOSTED_GATE_OUT (default <checkout>/.hosted-gate).
set -eu
[ "$(uname -s)" = Darwin ] || { echo "hosted-gate: refused: macOS only" >&2; exit 2; }
R=$(cd "$(dirname "$0")/../.." && pwd -P)
cd "$R"
OUT=${HOSTED_GATE_OUT:-$R/.hosted-gate}
rm -rf "$OUT"; mkdir -p "$OUT/oracles"
# The scratch root by its real path (port-vs-capture relocates M0's captures under it, which needs no symbolic link on
# the way: the runner's temp is /Users/runner/work/_temp; macOS's /tmp and /var are aliases).
S=$(mktemp -d "${RUNNER_TEMP:-$HOME}/cua159.XXXXXX")
S=$(cd "$S" && pwd -P)
trap 'rm -rf "$S"' EXIT
H=$S/home U=$S/userhome
mkdir -p "$U"
M0=docs/evidence/2026-10-17-own-sandbox/m0
# The mini's scratch root in M0's records (oracle.mjs ran there with --home ~/cua-115/home --user-home ~/cua-115/userhome).
M0_ROOT=/Users/new/cua-115
# What every cua command here sees: the scratch homes, a fixed PATH with this Node.
scratch() { env -i PATH="/usr/bin:/bin:/usr/sbin:/sbin:$(dirname "$(command -v node)")" HOME="$U" CUA_HOME="$H" LANG=C.UTF-8 TMPDIR="$S/tmp" "$@"; }
mkdir -p "$S/tmp"

failed=0 results=''
step() {
  label=$1; shift
  start=$(date +%s)
  if "$@"; then status=PASS; else status=FAIL; failed=$((failed + 1)); fi
  line="$status $label ($(( $(date +%s) - start ))s)"
  echo "hosted-gate: $line" >&2
  results="$results$line
"
}

install() { scratch node bin/cua.mjs install --json > "$OUT/install.json"; }
no_codex() {
  found=$(find "$H" \( -name CodexCLI.app -o \( -name codex -type f \) \) -print | wc -l | tr -d ' ')
  echo "hosted-gate: Codex CLI files in the installed tree: $found" >&2
  [ "$found" = 0 ]
}
doctor() {
  scratch node bin/cua.mjs doctor --json > "$OUT/doctor.json" || true
  node -e 'const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); const row = r.checks.find(c => c.name === "sandbox.launcher");
    const named = /codexCli|CodexCLI/.test(JSON.stringify(r)); console.error(`hosted-gate: doctor sandbox.launcher ${row?.status}, a Codex CLI row ${named}`);
    process.exit(row?.status === "pass" && !named ? 0 : 1)' "$OUT/doctor.json"
}
build_fp() { xcrun clang -O2 -Wall -o "$S/cua-fp" scripts/sandbox-probe/fingerprint.c; }
fingerprint() { scratch node scripts/sandbox-probe/oracle.mjs fingerprint --home "$H" --user-home "$U" --mode "$1" --launcher cua --role "$2" --fp "$S/cua-fp" --out "$OUT/oracles/fp-cua-$2-$1.json"; }
judge() { node scripts/sandbox-probe/oracle.mjs compare-fingerprints "$1" "$2" --expect "$3" --out "$4" > /dev/null; }
port_vs_capture() { scratch node scripts/sandbox-probe/oracle.mjs port-vs-capture --capture "$M0/argv-capture/capture-signed-$1.json" --relocate "$M0_ROOT=$S/m0" --out "$OUT/oracles/port-vs-signed-$1.json"; }
own_sandbox() { scratch node scripts/accept/own-sandbox.mjs --home "$H" --host "$1" --out "$OUT/own-sandbox-$1.json" > /dev/null; }
probe_secrets() {
  code=0
  scratch node scripts/probe-secrets.mjs --report "$OUT/probe-secrets.json" > /dev/null || code=$?
  [ -f "$OUT/probe-secrets.json" ] && node -e 'for (const s of JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).steps) console.error(`hosted-gate: probe-secrets ${s.status} ${s.name}`)' "$OUT/probe-secrets.json"
  return "$code"
}

step "install the pinned runtime" install
step "no Codex CLI in the installed tree" no_codex
step "doctor: sandbox.launcher pass, no Codex CLI row" doctor
step "build the fingerprint probe" build_fp
for mode in scoped default; do
  for role in kernel worker; do step "oracles: fingerprint cua-$role $mode" fingerprint "$mode" "$role"; done
  step "oracles: golden kernel vs cua kernel, $mode" judge "$M0/fingerprint/fp-golden-kernel-$mode.json" "$OUT/oracles/fp-cua-kernel-$mode.json" golden-kernel/cua-kernel "$OUT/oracles/fp-compare-golden-kernel-cua-kernel-$mode.json"
  step "oracles: signed CLI vs cua worker, $mode" judge "$M0/fingerprint/fp-signed-$mode.json" "$OUT/oracles/fp-cua-worker-$mode.json" signed/cua-worker "$OUT/oracles/fp-compare-signed-cua-worker-$mode.json"
  step "oracles: port vs signed capture, $mode" port_vs_capture "$mode"
done
step "own-sandbox, cua's own host" own_sandbox cua
step "own-sandbox, vendor host" own_sandbox vendor
step "probe-secrets, synthetic store" probe_secrets

printf '\nhosted-gate summary\n%s' "$results" >&2
if [ "$failed" -gt 0 ]; then echo "hosted-gate: $failed step(s) failed; the reports are in $OUT" >&2; exit 1; fi
echo "hosted-gate: every step passed" >&2
