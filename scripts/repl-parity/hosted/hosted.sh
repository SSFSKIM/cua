#!/bin/sh
# #159: repl-parity's live checks that need a browser but neither the owner nor a TCC grant, on GitHub's hosted macOS
# runner, so a pull request touching them is proven with no time on the Mac mini. Two ci-kit gates (.github/ci-kit.yml),
# one item each, so they run in parallel on two runners:
#
#   sh scripts/repl-parity/hosted/hosted.sh denials    gate `sandbox-denials`
#   sh scripts/repl-parity/hosted/hosted.sh browser    gate `parity-browser`
#
# Both items share the setup:
#   harness Chrome  Chrome for Testing, preinstalled on the hosted image, with cua's extension loaded unpacked, on the
#                   user-data directory `cua chrome register` finds ($HOME/Library/Application Support/Google/Chrome),
#                   after `cua install` and register; cua's profile `harness` added on its Default profile and bound to
#                   the live backend. Binding reads `pick_required` (reason `unlabelled`) when the vendor's profile
#                   label has not reached the backend yet (2 of the spike's 3 green runs); the step then binds the one
#                   live backend by its id, the pick a user makes.
#   the device      the runner reaches itself as repl-parity's device `hosted-macos` (scripts/repl-parity/devices.mjs)
#                   over a user-mode sshd on loopback, with the job's PATH; `repl-parity prepare` with profile harness.
# Then the item:
#   denials   cua's own host runs the `cells` and `services` suites under `sudo log stream --style ndjson --predicate
#             'sender == "Sandbox"'`; the suites' assertions must pass, and the denials, reduced by
#             scripts/sandbox-probe/denials.mjs, must hold no preferences (cfprefs) denial and stay within the declared
#             set, #115 M1's accepted after side (denials-within.mjs, denials-declared.json). One-sided: the Codex CLI's
#             before profile is gone.
#   browser   the vendor host and cua's own host run the `api` and `docs-profiles` suites; each pair is diffed with
#             test/repl-parity/expected-differences.json and must show no undeclared difference.
#
# It edits ~/.ssh, starts an sshd and registers a native host under the real HOME, so it refuses to run anywhere but a
# throwaway GitHub-hosted macOS runner (RUNNER_ENVIRONMENT=github-hosted).
#
# Public output (the repository is public). The log carries only each step's PASS/FAIL/SKIP line with its duration and
# the summary, and the `hosted-parity:` lines: the image and versions, booleans, exit statuses, cua's outcome and reason
# codes, the runs' counts and failed case ids, the diffs' counts and undeclared differences' ids, the denial kinds
# (public.mjs, denials-within.mjs). Every command's stderr goes to the scratch root and the log gets only `stderr
# withheld (<n> lines)`; reports, run directories and the raw `log stream` output stay in the scratch root, the denial
# log removed as soon as it is judged and the root at exit. No artifact. Every step's failure fails the gate; a step that
# depends on a failed one is reported SKIP.
set -u
ITEM=${1:-}
case "$ITEM" in denials|browser) ;; *) echo "usage: sh scripts/repl-parity/hosted/hosted.sh denials|browser" >&2; exit 2 ;; esac
if [ "$(uname -s)" != Darwin ] || [ "${RUNNER_ENVIRONMENT:-}" != github-hosted ]; then
  echo "hosted-parity: refused: it edits ~/.ssh, starts an sshd and registers a native host under the real HOME, so it runs only on a GitHub-hosted macOS runner" >&2
  exit 2
fi
R=$(cd "$(dirname "$0")/../../.." && pwd -P)
cd "$R" || exit 2
H=scripts/repl-parity/hosted
S=$(mktemp -d "${RUNNER_TEMP:-$HOME}/cua159p.XXXXXX") && S=$(cd "$S" && pwd -P) || exit 2
case "$S" in */cua159p.*) ;; *) echo "hosted-parity: no scratch root" >&2; exit 2 ;; esac
ERR=$S/stderr RUNS=$S/runs SSHD=$S/sshd
mkdir -p "$ERR" "$RUNS" "$SSHD"
CFT="/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
UDD="$HOME/Library/Application Support/Google/Chrome"
EXTENSION_ID=jkejaaijdfpohkdhankllbekkhmnippb
DEVICE=hosted-macos
# The log is fd 3; inside a step, stderr is the step's scratch file (step).
exec 3>&2
say() { echo "hosted-parity: $*" >&3; }

prepared=no
cleanup() {
  [ "$prepared" = no ] || node scripts/repl-parity.mjs cleanup-prepared --device "$DEVICE" > /dev/null 2>&1
  sudo -n pkill -f "log stream --style ndjson" 2> /dev/null
  [ -f "$S/chrome.pid" ] && kill "$(cat "$S/chrome.pid")" 2> /dev/null
  [ -f "$SSHD/sshd.pid" ] && kill "$(cat "$SSHD/sshd.pid")" 2> /dev/null
  case "$S" in */cua159p.*) rm -rf "$S" ;; esac
}
trap cleanup EXIT

# quiet <name> <command...>: the command with its stderr kept in $ERR/<name>; when it fails, the log gets its status and
# how many stderr lines were withheld, never a line. -> the command's status.
quiet() {
  q_name=$1; shift
  q_code=0
  "$@" 2> "$ERR/$q_name" || q_code=$?
  q_lines=$(wc -l < "$ERR/$q_name" | tr -d ' ')
  [ "$q_code" = 0 ] || say "$q_name exited $q_code$([ "$q_lines" = 0 ] || echo "; stderr withheld ($q_lines lines)")"
  return "$q_code"
}
# The public readers (public.mjs): their exit status is the verdict they read; their own stderr is withheld too.
public() { node "$H/public.mjs" "$@" 2>> "$ERR/public"; }

failed=0 results=''
record() { results="$results$1
"; echo "hosted-parity: $1" >&3; }
# step <label> <command...>: PASS or FAIL with its duration; a failure counts against the gate. Whatever the step writes
# to stderr outside `quiet` (a shell diagnostic, a failed redirection) is kept in the scratch root and only counted.
# -> the command's status.
steps=0
step() {
  s_label=$1; shift
  s_start=$(date +%s) s_code=0 steps=$((steps + 1))
  "$@" 2> "$ERR/step-$steps" || s_code=$?
  s_lines=$(wc -l < "$ERR/step-$steps" | tr -d ' ')
  [ "$s_lines" = 0 ] || say "stderr withheld ($s_lines lines)"
  if [ "$s_code" = 0 ]; then s_status=PASS; else s_status=FAIL; failed=$((failed + 1)); fi
  record "$s_status $s_label ($(( $(date +%s) - s_start ))s)"
  return "$s_code"
}
# gated <ready> <label> <command...>: the step when its precondition held, else SKIP (the failed step already counts).
gated() { if [ "$1" = yes ]; then shift; step "$@"; else record "SKIP $2 (an earlier step failed)"; return 1; fi; }

# --- setup ---------------------------------------------------------------------------------------------------------
chrome_present() {
  [ -x "$CFT" ] || return 1
  say "Chrome for Testing $("$CFT" --version 2> /dev/null | awk '{print $NF}')"
}
cua_install() { quiet install node bin/cua.mjs install --json > "$S/install.json"; }
# register looks for a browser's user-data directory: the harness Chrome's is made before its first launch.
register() {
  mkdir -p "$UDD"
  quiet register node bin/cua.mjs chrome register --json > "$S/register.json" || return
  manifest="$UDD/NativeMessagingHosts/io.github.ssfskim.cua.json"
  grep -q "chrome-extension://$EXTENSION_ID/" "$manifest" 2> /dev/null || { say "the native host manifest does not name cua's extension"; return 1; }
  # Also in Chrome for Testing's own default data directory, as the spike ran it.
  mkdir -p "$HOME/Library/Application Support/Google/Chrome for Testing/NativeMessagingHosts"
  cp "$manifest" "$HOME/Library/Application Support/Google/Chrome for Testing/NativeMessagingHosts/"
}
launch_chrome() {
  "$CFT" --user-data-dir="$UDD" --profile-directory=Default --no-first-run --no-default-browser-check \
    --disable-search-engine-choice-screen --load-extension="$R/extension" about:blank > /dev/null 2> "$ERR/chrome" 3>&- &
  echo $! > "$S/chrome.pid"
  n=0; while [ ! -d "$UDD/Default" ] && [ $n -lt 60 ]; do sleep 1; n=$((n + 1)); done
  [ -d "$UDD/Default" ] || { say "Chrome made no Default profile in 60 s"; return 1; }
}
profile_add() { quiet profiles-add node bin/cua.mjs profiles add harness --chrome-profile Default --json > "$S/add.json"; }
# A live backend that cua would not bind on its own (pick_required) exits 1 here and is still live: the report decides.
backend_live() {
  node bin/cua.mjs profiles bind harness --dry-run --json > "$S/bind-dry.json" 2> "$ERR/bind-dry"
  public live "$S/bind-dry.json"
}
wait_backend() {
  n=0; while [ $n -lt 45 ]; do backend_live && break; sleep 2; n=$((n + 1)); done
  say "extension store present $([ -d "$UDD/Default/Local Extension Settings/$EXTENSION_ID" ] && echo yes || echo no); live backend after ~$((n * 2))s: $([ $n -lt 45 ] && echo yes || echo no)"
  [ $n -lt 45 ]
}
bind() {
  node bin/cua.mjs profiles bind harness --json > "$S/bind.json" 2> "$ERR/bind"
  public bind "$S/bind.json" && return
  id=$(node "$H/public.mjs" only-backend "$S/bind.json" 2> /dev/null) || { say "bind: no single live backend to pick"; return 1; }
  say "bind: picking the one live backend by its id"
  quiet bind-explicit node bin/cua.mjs profiles bind harness --extension-instance-id "$id" --json > "$S/bind2.json" && public bind "$S/bind2.json"
}
ready() { node bin/cua.mjs profiles list --json > "$S/list.json" 2> "$ERR/list"; public ready "$S/list.json" harness; }
sshd_up() {
  mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh" || return
  quiet keygen-host ssh-keygen -q -t ed25519 -N '' -f "$SSHD/hostkey" || return
  rm -f "$HOME/.ssh/hosted-parity" "$HOME/.ssh/hosted-parity.pub"
  quiet keygen-user ssh-keygen -q -t ed25519 -N '' -f "$HOME/.ssh/hosted-parity" || return
  cat "$HOME/.ssh/hosted-parity.pub" >> "$HOME/.ssh/authorized_keys" && chmod 600 "$HOME/.ssh/authorized_keys" || return
  echo "PATH=$PATH" > "$HOME/.ssh/environment"
  cat > "$SSHD/sshd_config" <<EOF
Port 2222
ListenAddress 127.0.0.1
HostKey $SSHD/hostkey
PidFile $SSHD/sshd.pid
AuthorizedKeysFile $HOME/.ssh/authorized_keys
PasswordAuthentication no
KbdInteractiveAuthentication no
UsePAM no
StrictModes no
PermitUserEnvironment yes
EOF
  cat >> "$HOME/.ssh/config" <<EOF
Host $DEVICE
  HostName 127.0.0.1
  Port 2222
  User $USER
  IdentityFile $HOME/.ssh/hosted-parity
  IdentitiesOnly yes
  StrictHostKeyChecking no
  UserKnownHostsFile /dev/null
  LogLevel ERROR
EOF
  quiet sshd /usr/sbin/sshd -f "$SSHD/sshd_config" -E "$SSHD/sshd.log" 3>&- || return
  sleep 1
}
ssh_node() {
  remote=$(quiet ssh ssh -o BatchMode=yes "$DEVICE" 'node -v') || return
  [ "$remote" = "$(node -v)" ] || { say "the device's node is not the job's"; return 1; }
}
prepare() {
  quiet prepare node scripts/repl-parity.mjs prepare --device "$DEVICE" --commit "$(git rev-parse HEAD)" --profile harness > "$S/prepare.json" || return
  prepared=yes
}

say "macOS $(sw_vers -productVersion) ($(sw_vers -buildVersion)) $(uname -m), image ${ImageOS:-?} ${ImageVersion:-?}; node $(node -v); item $ITEM"
ok=yes
step "Chrome for Testing preinstalled" chrome_present || ok=no
step "cua install (discovery home)" cua_install || ok=no
step "cua chrome register (manifest names cua's extension)" register || ok=no
gated $ok "harness Chrome launched with cua's extension" launch_chrome || ok=no
gated $ok "cua profiles add harness" profile_add || ok=no
gated $ok "a live backend" wait_backend || ok=no
gated $ok "cua profiles bind harness" bind || ok=no
gated $ok "profile harness ready and bound" ready || ok=no
device=yes
step "user-mode sshd on loopback" sshd_up || device=no
gated $device "ssh $DEVICE reaches this runner with the job's node" ssh_node || device=no
[ $device = yes ] || ok=no
gated $ok "repl-parity prepare on $DEVICE, profile harness" prepare || ok=no

# run <host> <suite>: repl-parity's run; it must exit 0 and its summary show a complete run whose assertions passed.
# -> nonzero when either does not hold.
run() {
  r_dir=$RUNS/$1-$2 r_code=0
  quiet "run-$1-$2" node scripts/repl-parity.mjs run --device "$DEVICE" --host "$1" --suite "$2" --out "$r_dir" > "$r_dir.out" || r_code=$?
  public run "$r_dir.out" "$r_dir" "$1/$2" || [ "$r_code" != 0 ] || r_code=1
  return "$r_code"
}

# --- denials -------------------------------------------------------------------------------------------------------
LOGPID=''
stream_start() {
  sudo -n log stream --style ndjson --predicate 'sender == "Sandbox"' > "$S/denials.ndjson" 2> "$ERR/log-stream" 3>&- &
  LOGPID=$!
  sleep 2
  kill -0 "$LOGPID" 2> /dev/null || { say "log stream is not running"; return 1; }
}
# The stream must still be up when the suites end, or the judgement would read a truncated log.
stream_stop() {
  s_alive=no
  kill -0 "$LOGPID" 2> /dev/null && s_alive=yes
  sudo -n pkill -f "log stream --style ndjson" 2> /dev/null
  wait "$LOGPID" 2> /dev/null
  say "log stream up until the suites ended: $s_alive; $(wc -l < "$S/denials.ndjson" | tr -d ' ') lines recorded"
  [ $s_alive = yes ]
}
judge() {
  j_code=0
  quiet judge node "$H/denials-within.mjs" "$S/denials.ndjson" "$H/denials-declared.json" || j_code=$?
  rm -f "$S/denials.ndjson"
  return "$j_code"
}
if [ "$ITEM" = denials ]; then
  streaming=$ok
  gated $ok "log stream (Sandbox denials) recording" stream_start || streaming=no
  gated $streaming "cua host, suite cells" run cua cells
  gated $streaming "cua host, suite services" run cua services
  if [ $streaming = yes ]; then
    step "log stream stayed up" stream_stop || streaming=no
  else
    sudo -n pkill -f "log stream --style ndjson" 2> /dev/null; rm -f "$S/denials.ndjson"
  fi
  gated $streaming "denials: no preferences denial, every kind declared" judge
fi

# --- browser -------------------------------------------------------------------------------------------------------
# The comparator must exit 0 and its report show no undeclared difference.
diff_suite() {
  d_code=0
  quiet "diff-$1" node scripts/repl-parity.mjs diff "$RUNS/vendor-$1" "$RUNS/cua-$1" --expected test/repl-parity/expected-differences.json > "$S/diff-$1.json" || d_code=$?
  public diff "$S/diff-$1.json" "$1" || [ "$d_code" != 0 ] || d_code=1
  return "$d_code"
}
if [ "$ITEM" = browser ]; then
  for suite in api docs-profiles; do
    sides=$ok
    gated $ok "vendor host, suite $suite" run vendor "$suite" || sides=no
    gated $ok "cua host, suite $suite" run cua "$suite" || sides=no
    gated $sides "diff $suite: no undeclared difference" diff_suite "$suite"
  done
fi

# --- cleanup -------------------------------------------------------------------------------------------------------
cleanup_prepared() { quiet cleanup-prepared node scripts/repl-parity.mjs cleanup-prepared --device "$DEVICE" > /dev/null && prepared=no; }
[ $prepared = no ] || step "repl-parity cleanup-prepared" cleanup_prepared

printf '\nhosted-parity summary (%s)\n%s' "$ITEM" "$results" >&3
if [ "$failed" -gt 0 ]; then
  say "$failed step(s) failed"; exit 1
fi
say "every step passed"
