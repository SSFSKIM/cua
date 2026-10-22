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
#                 scoped and default (each kernel run pins the metadata grant), judged equal to the hosted baseline:
#                 the same fingerprints of a reviewed commit, recorded on the hosted image ($BASELINE, its image.json).
#                 Not against M0's golden-kernel and signed-CLI fingerprints: those were taken on the mini's macOS 27,
#                 and the hosted macOS 26 answers some checks differently under the same profile (file-link on system
#                 paths), so that judgement stays the mini's (scripts/sandbox-probe/m1-mini.sh `oracles`). And cua's port
#                 rendering M0's two signed-CLI argv captures, relocated from the mini's scratch root to this one
#                 (oracle.mjs port-vs-capture): a rendering, not an OS answer, so it holds on any Mac (#115 item 8).
#                 A change that moves a fingerprint on purpose records the new baseline in the same pull request: the
#                 failing gate's artifact holds this run's fingerprints (the baseline's form) and image.json.
#   own-sandbox   scripts/accept/own-sandbox.mjs on cua's own host and on the vendor host (#115 items 1 to 5).
#   probe-secrets scripts/probe-secrets.mjs against its own synthetic store (#115 items 6 and 7's live roundtrip).
#   engine-lane   scripts/probe-engine-lane.mjs (#117), cua's engine service on cua's own host (the target row) and in the
#                 vendor trusted worker (comparison A's lane), against a fixture approved engine and a fake engine at its
#                 socket; nothing is launched.
# The golden fixtures and the fail-closed suites run in the unit suite (gate `test`).
#
# Public output (the repo is public). The runner's log carries only: each step's PASS/FAIL line and the summary; the
# gate's own `hosted-gate:` lines (the run's and the baseline's images, the count of Codex CLI files in the installed
# tree, doctor's sandbox.launcher status, probe-secrets' step names and statuses, of a fingerprint judged unequal its
# undeclared checks' labels and results and its environment differences' names, never their values, and of a command
# that failed its exit status and how many stderr lines were withheld); own-sandbox's and engine-lane's `PASS <label>`
# and `FAIL <label>` lines; hosted-public.mjs's one failure line, naming the form and the files' basenames. Every producer's stderr (an
# oracle's child stderr, install's and doctor's own, the publisher's) goes to the scratch root (quiet), never to the log.
# The raw reports (oracle records with the launch's args, env and rendered profiles and the checks' target paths;
# free-text details; stderr excerpts; install's and doctor's JSON) stay in the scratch root too, removed at exit. The
# artifact, $HOSTED_GATE_OUT (default <checkout>/hosted-gate-out, uploaded only when the gate fails; not a dotted name,
# which upload-artifact skips), holds only the allowlisted public forms scripts/sandbox-probe/hosted-public.mjs writes:
# oracles/fp-*.json the fingerprints ({launcher, fingerprint: {sandboxed, cwd, env, checks: [{op, filter, label, result,
# errno?}]}, pins?: {ok, rows: [{label, op, want, got}]}}: cwd and the values of the launcher's own variables relative
# to the run's roots, `<cua-home>/…`, `<home>/…`, `<checkout>/…`, `<session>`; any other variable by name, its value
# `<withheld>`; no check target; the baseline's form, and what the judgement compares), oracles/image.json,
# oracles/port-vs-signed-*.json the comparison's booleans and counts, own-sandbox-*.json and engine-lane-*.json check labels,
# passes and error codes, probe-secrets.json and doctor.json statuses by name; nothing of install's. Every secret is a generated
# synthetic value that the checks keep inside their cells and scan their own reports for; the runtime is never copied
# out of the scratch root. Every step runs and is reported even after an earlier one failed, and a step whose report
# could not be published fails; the gate then exits 1 naming each failed step.
set -eu
[ "$(uname -s)" = Darwin ] || { echo "hosted-gate: refused: macOS only" >&2; exit 2; }
R=$(cd "$(dirname "$0")/../.." && pwd -P)
cd "$R"
OUT=${HOSTED_GATE_OUT:-$R/hosted-gate-out}
rm -rf "$OUT"; mkdir -p "$OUT/oracles"
# The scratch root by its real path (port-vs-capture relocates M0's captures under it, which needs no symbolic link on
# the way: the runner's temp is /Users/runner/work/_temp; macOS's /tmp and /var are aliases).
S=$(mktemp -d "${RUNNER_TEMP:-$HOME}/cua159.XXXXXX")
S=$(cd "$S" && pwd -P)
trap 'rm -rf "$S"' EXIT
H=$S/home U=$S/userhome
# The raw reports, kept in the scratch root; $OUT gets their public forms (publish). Beside them every producer's
# stderr, which can quote a report, a rendered profile or a child's own output (quiet).
RAW=$S/reports ERR=$S/stderr
mkdir -p "$U" "$RAW/oracles" "$ERR"
M0=docs/evidence/2026-10-17-own-sandbox/m0
BASELINE=docs/evidence/2026-10-18-hosted-macos-gate/baseline
# The mini's scratch root in M0's records (oracle.mjs ran there with --home ~/cua-115/home --user-home ~/cua-115/userhome).
M0_ROOT=/Users/new/cua-115
# What every cua command here sees: the scratch homes, a fixed PATH with this Node.
scratch() { env -i PATH="/usr/bin:/bin:/usr/sbin:/sbin:$(dirname "$(command -v node)")" HOME="$U" CUA_HOME="$H" LANG=C.UTF-8 TMPDIR="$S/tmp" "$@"; }
mkdir -p "$S/tmp"
# quiet <name> <public> <command...>: the command with its stderr kept in $ERR/<name>. The log gets only the lines of it
# matching <public> (an extended regex; '' for none) and, when the command fails, its status and how many lines were
# withheld. -> the command's status.
quiet() {
  q_name=$1 q_public=$2; shift 2
  q_code=0
  "$@" 2> "$ERR/$q_name" || q_code=$?
  q_shown=0
  if [ -n "$q_public" ]; then
    grep -E "$q_public" "$ERR/$q_name" >&2 || true
    q_shown=$(grep -cE "$q_public" "$ERR/$q_name" || true)
  fi
  q_withheld=$(( $(wc -l < "$ERR/$q_name") - q_shown ))
  [ "$q_code" = 0 ] || echo "hosted-gate: $q_name exited $q_code$([ "$q_withheld" = 0 ] || echo "; stderr withheld ($q_withheld lines)")" >&2
  return "$q_code"
}
# publish <form> <raw> <public>: the raw report's public form (hosted-public.mjs, whose one line on a failure names the
# form and the files only). It fails when the raw report is missing. Each step below that publishes fails when its
# producer or its publication does, with the producer's status when both do.
publish() { quiet "publish-$(basename "$3" .json)" '^hosted-public: ' node scripts/sandbox-probe/hosted-public.mjs "$@"; }

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

# This gate's engine lane uses a fixture, not a capturing engine. Keep installation vendor-only even after the default
# flips; engine-swift builds and verifies the real ad-hoc bundle in its own scratch HOME, without granting permissions.
install() { quiet install '' scratch env CUA_NATIVE_ENGINE=vendor node bin/cua.mjs install --json > "$RAW/install.json"; }
no_codex() {
  found=$(find "$H" \( -name CodexCLI.app -o \( -name codex -type f \) \) -print 2> "$ERR/no-codex" | wc -l | tr -d ' ')
  echo "hosted-gate: Codex CLI files in the installed tree: $found" >&2
  [ "$found" = 0 ]
}
# doctor's own status is not the step's (a check this gate does not judge may fail on a runner).
doctor() {
  scratch node bin/cua.mjs doctor --json > "$RAW/doctor.json" 2> "$ERR/doctor" || true
  code=0
  quiet doctor-read '^hosted-gate: ' node -e 'const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); const row = r.checks.find(c => c.name === "sandbox.launcher");
    const named = /codexCli|CodexCLI/.test(JSON.stringify(r)); console.error(`hosted-gate: doctor sandbox.launcher ${row?.status}, a Codex CLI row ${named}`);
    process.exit(row?.status === "pass" && !named ? 0 : 1)' "$RAW/doctor.json" || code=$?
  publish doctor "$RAW/doctor.json" "$OUT/doctor.json" || [ "$code" != 0 ] || code=1
  return "$code"
}
build_fp() { quiet build-fp '' xcrun clang -O2 -Wall -o "$S/cua-fp" scripts/sandbox-probe/fingerprint.c; }
# The fingerprint's public form is the baseline's, and what the judgement compares.
fingerprint() {
  code=0
  quiet "fingerprint-$2-$1" '' scratch node scripts/sandbox-probe/oracle.mjs fingerprint --home "$H" --user-home "$U" --mode "$1" --launcher cua --role "$2" --fp "$S/cua-fp" --out "$RAW/oracles/fp-cua-$2-$1.json" || code=$?
  publish fingerprint "$RAW/oracles/fp-cua-$2-$1.json" "$OUT/oracles/fp-cua-$2-$1.json" || [ "$code" != 0 ] || code=1
  return "$code"
}
judge() {
  code=0
  quiet "$(basename "$4" .json)" '' node scripts/sandbox-probe/oracle.mjs compare-fingerprints "$1" "$2" --expect "$3" --out "$4" > /dev/null || code=$?
  [ ! -f "$4" ] || quiet "$(basename "$4" .json)-read" '^hosted-gate: ' node -e 'const {judgement: j} = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); const e = j.undeclared.env;
    if (!j.ok) console.error(`hosted-gate: undeclared: ${JSON.stringify({checks: j.undeclared.checks.map(c => `${c.op} ${c.label} ${c.left?.result ?? "-"}/${c.right?.result ?? "-"}`),
      env: {onlyLeft: e.onlyLeft, onlyRight: e.onlyRight, differing: e.differing.map(d => d.name)}, cwd: j.undeclared.cwd, sandboxed: j.undeclared.sandboxed})}`)' "$4" || true
  return "$code"
}
port_vs_capture() {
  code=0
  quiet "port-vs-signed-$1" '' scratch node scripts/sandbox-probe/oracle.mjs port-vs-capture --capture "$M0/argv-capture/capture-signed-$1.json" --relocate "$M0_ROOT=$S/m0" --out "$RAW/oracles/port-vs-signed-$1.json" || code=$?
  publish port-vs-capture "$RAW/oracles/port-vs-signed-$1.json" "$OUT/oracles/port-vs-signed-$1.json" || [ "$code" != 0 ] || code=1
  return "$code"
}
own_sandbox() {
  code=0
  # Its stderr's `PASS <label>` and `FAIL <label>` lines are its checks' labels (own-sandbox.mjs `check`), the rest withheld.
  quiet "own-sandbox-$1" '^(PASS|FAIL) ' scratch node scripts/accept/own-sandbox.mjs --home "$H" --host "$1" --out "$RAW/own-sandbox-$1.json" > /dev/null || code=$?
  publish own-sandbox "$RAW/own-sandbox-$1.json" "$OUT/own-sandbox-$1.json" || [ "$code" != 0 ] || code=1
  return "$code"
}
probe_secrets() {
  code=0
  quiet probe-secrets '' scratch node scripts/probe-secrets.mjs --report "$RAW/probe-secrets.json" > /dev/null || code=$?
  [ ! -f "$RAW/probe-secrets.json" ] || quiet probe-secrets-read '^hosted-gate: ' node -e 'for (const s of JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).steps) console.error(`hosted-gate: probe-secrets ${s.status} ${s.name}`)' "$RAW/probe-secrets.json" || true
  publish probe-secrets "$RAW/probe-secrets.json" "$OUT/probe-secrets.json" || [ "$code" != 0 ] || code=1
  return "$code"
}
engine_lane() {
  code=0
  # A short user home per host: the fake engine's socket sits beside the fixture bundle under it, and a socket path
  # holds at most 104 bytes. Its stderr's `PASS <label>` and `FAIL <label>` lines are the checks' labels, the rest withheld.
  quiet "engine-lane-$1" '^(PASS|FAIL) ' scratch node scripts/probe-engine-lane.mjs --home "$H" --user-home "$S/e$1" --host "$1" --report "$RAW/engine-lane-$1.json" || code=$?
  publish engine-lane "$RAW/engine-lane-$1.json" "$OUT/engine-lane-$1.json" || [ "$code" != 0 ] || code=1
  return "$code"
}

# The image this run is on, beside the fingerprints (a baseline is only good for the image it was recorded on).
node -e 'const [productVersion, buildVersion, image, imageVersion] = process.argv.slice(1); require("fs").writeFileSync(process.argv.at(-1), JSON.stringify({productVersion, buildVersion, arch: process.arch, image: image || null, imageVersion: imageVersion || null}, null, 2) + "\n")' \
  "$(sw_vers -productVersion)" "$(sw_vers -buildVersion)" "${ImageOS:-}" "${ImageVersion:-}" "$OUT/oracles/image.json"
echo "hosted-gate: this run: $(tr -d '\n ' < "$OUT/oracles/image.json"); Node $(node --version)" >&2
[ -f "$BASELINE/image.json" ] && echo "hosted-gate: the baseline's: $(tr -d '\n ' < "$BASELINE/image.json")" >&2
step "install the pinned runtime" install
step "no Codex CLI in the installed tree" no_codex
step "doctor: sandbox.launcher pass, no Codex CLI row" doctor
step "build the fingerprint probe" build_fp
for mode in scoped default; do
  for role in kernel worker; do
    step "oracles: fingerprint cua-$role $mode" fingerprint "$mode" "$role"
    step "oracles: cua-$role $mode equals the hosted baseline" judge "$BASELINE/fp-cua-$role-$mode.json" "$OUT/oracles/fp-cua-$role-$mode.json" hosted-baseline/cua "$RAW/oracles/fp-compare-baseline-cua-$role-$mode.json"
  done
  step "oracles: port vs signed capture, $mode" port_vs_capture "$mode"
done
step "own-sandbox, cua's own host" own_sandbox cua
step "own-sandbox, vendor host" own_sandbox vendor
step "probe-secrets, synthetic store" probe_secrets
step "engine lane: cua's engine on cua's own host" engine_lane cua
step "engine lane: cua's service in the vendor trusted worker" engine_lane vendor

printf '\nhosted-gate summary\n%s' "$results" >&2
if [ "$failed" -gt 0 ]; then
  if printf '%s' "$results" | grep -q '^FAIL oracles: .* equals the hosted baseline' && ! node -e 'const [a, b] = process.argv.slice(1).map(f => JSON.parse(require("fs").readFileSync(f, "utf8"))); process.exit(a.productVersion === b.productVersion && a.buildVersion === b.buildVersion ? 0 : 1)' "$BASELINE/image.json" "$OUT/oracles/image.json" 2>/dev/null; then
    echo "hosted-gate: this runner's macOS is not the baseline's: a fingerprint difference may be the OS's, not the change's. Compare the two images above; if only the OS moved, record the new baseline from a run of main's code (this gate's artifact, oracles/), as docs/evidence/2026-10-18-hosted-macos-gate/README.md says" >&2
  fi
  echo "hosted-gate: $failed step(s) failed; the public reports are in $OUT" >&2; exit 1
fi
echo "hosted-gate: every step passed" >&2
