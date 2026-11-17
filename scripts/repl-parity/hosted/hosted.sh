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
#                   over a user-mode sshd on loopback, with the job's PATH; `repl-parity prepare` with profile harness,
#                   its parity clone made first from the job's checkout (a pull request's merge commit is on no ref).
# Then the item:
#   denials   cua's own host runs the `cells` and `services` suites under `sudo log stream --style ndjson --predicate
#             'sender == "Sandbox"'`, stopped with SIGINT and read once it has exited; the suites' assertions must
#             pass, no record may be malformed, and the denials, reduced by
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
# codes, the runs' counts and failed case ids, each failed case's reason and cells in fixture data only (the kind of
# reason, each cell's outcome, time and labelled value; #168), the diffs' counts and undeclared differences' ids, the
# denial kinds (public.mjs, denials-within.mjs). Every command's stderr goes to the scratch root and the log gets only `stderr
# withheld (<n> lines)`; reports, run directories and the raw `log stream` output stay in the scratch root, the denial
# log removed as soon as it is judged and the root at exit. No artifact. Every step's failure fails the gate; a step that
# depends on a failed one is reported SKIP.
#
# Load, for diagnosis only (#168): PARITY_STRESS=cpu:<n> runs n CPU burners per core (`yes`, at the job's priority)
# while the browser item's api suite runs on both hosts, so a race that an idle runner hides can show. Unset, nothing
# changes; gate parity-browser-stress sets it, by hand only, and gate parity-browser never does. Beside it, also for
# diagnosis only, PARITY_CHROME_FLAGS=anti-throttling launches the harness Chrome with
# --disable-renderer-backgrounding, --disable-backgrounding-occluded-windows and --disable-background-timer-throttling,
# which tells a CPU-starved renderer from a throttled one (#141, #168).
set -u
ITEM=${1:-}
case "$ITEM" in denials|browser) ;; *) echo "usage: sh scripts/repl-parity/hosted/hosted.sh denials|browser" >&2; exit 2 ;; esac
STRESS=${PARITY_STRESS:-}
case "$STRESS" in
  '') ;;
  cpu:[1-9]|duty:[1-9][0-9]) [ "$ITEM" = browser ] || { echo "hosted-parity: PARITY_STRESS is for the browser item" >&2; exit 2; } ;;
  *) echo "hosted-parity: PARITY_STRESS must be cpu:<1-9> or duty:<10-99>" >&2; exit 2 ;;
esac
case "${PARITY_CHROME_FLAGS:-}" in
  '') CHROME_FLAGS='' ;;
  anti-throttling) CHROME_FLAGS='--disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-background-timer-throttling' ;;
  renderer-backgrounding) CHROME_FLAGS='--disable-renderer-backgrounding' ;;   # #384 diagnosis: that flag alone
  *) echo "hosted-parity: PARITY_CHROME_FLAGS must be anti-throttling or renderer-backgrounding" >&2; exit 2 ;;
esac
if [ "$(uname -s)" != Darwin ] || [ "${RUNNER_ENVIRONMENT:-}" != github-hosted ]; then
  echo "hosted-parity: refused: it edits ~/.ssh, starts an sshd and registers a native host under the real HOME, so it runs only on a GitHub-hosted macOS runner" >&2
  exit 2
fi
R=$(cd "$(dirname "$0")/../../.." && pwd -P)
cd "$R" || exit 2
H=scripts/repl-parity/hosted
S=$(mktemp -d "${RUNNER_TEMP:-$HOME}/cua159p.XXXXXX") && S=$(cd "$S" && pwd -P) || exit 2
case "$S" in */cua159p.*) ;; *) echo "hosted-parity: no scratch root" >&2; exit 2 ;; esac
ERR=$S/stderr RUNS=$S/runs SSHD=$S/sshd DIAG=$S/diag
mkdir -p "$ERR" "$RUNS" "$SSHD" "$DIAG"
# #384 diagnosis (branch diag/384-cdp-latency, never merged): the instrumented host, supervisor and service write their
# timing rows under $DIAG (src/chrome/diag384.mjs reads this file); PARITY_ORDER=cua-first runs cua's host first.
# PARITY_FG (#384 ruling 794) names an experiment that keeps hidden agent tabs at foreground priority: audio, window,
# screencast (the host and extension read it from the same file) or policy (Chrome's ForceForegroundPriorityForUrls,
# written below as a managed preference before Chrome starts).
FG=${PARITY_FG:-}
case "$FG" in ''|audio|window|screencast|policy) ;; *) echo "hosted-parity: PARITY_FG must be audio, window, screencast or policy" >&2; exit 2 ;; esac
printf '{"dir":"%s","fg":"%s"}\n' "$DIAG" "$FG" > "$HOME/.cua-diag-384.json"
ORDER=${PARITY_ORDER:-vendor-first}
case "$ORDER" in vendor-first|cua-first) ;; *) echo "hosted-parity: PARITY_ORDER must be vendor-first or cua-first" >&2; exit 2 ;; esac
CFT="/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
UDD="$HOME/Library/Application Support/Google/Chrome"
EXTENSION_ID=jkejaaijdfpohkdhankllbekkhmnippb
DEVICE=hosted-macos
# The log is fd 3; inside a step, stderr is the step's scratch file (step).
exec 3>&2
say() { echo "hosted-parity: $*" >&3; }

prepared=no
BURNERS=''
stress_stop() { [ -z "$BURNERS" ] || kill $BURNERS 2> /dev/null; BURNERS=''; }
# stress_start: the burners PARITY_STRESS names, one `yes` each, their pids kept so that only they are stopped.
stress_start() {
  [ -n "$STRESS" ] || return 0
  b_cores=$(sysctl -n hw.ncpu) b_i=0
  case "$STRESS" in
    duty:*)   # #384 ruling 794: one process per core that burns ${STRESS#duty:} % of every 100 ms and sleeps the rest
      b_n=$b_cores
      while [ $b_i -lt $b_n ]; do node "$H/diag384-duty.mjs" "${STRESS#duty:}" > /dev/null 2>&1 3>&- & BURNERS="$BURNERS $!"; b_i=$((b_i + 1)); done ;;
    *)
      b_n=$((b_cores * ${STRESS#cpu:}))
      while [ $b_i -lt $b_n ]; do yes > /dev/null 3>&- & BURNERS="$BURNERS $!"; b_i=$((b_i + 1)); done ;;
  esac
  say "stress: $b_n CPU burners ($STRESS on $b_cores cores) while suite api runs"
}
SAMPLER=''
cleanup() {
  stress_stop
  [ -z "$SAMPLER" ] || kill "$SAMPLER" 2> /dev/null
  rm -f "$HOME/.cua-diag-384.json"
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
  [ -z "$CHROME_FLAGS" ] || say "chrome flags: ${PARITY_CHROME_FLAGS}"
  [ -z "$FG" ] || say "diag384: fg experiment $FG"
  if [ "$FG" = policy ]; then
    bid=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "/Applications/Google Chrome for Testing.app/Contents/Info.plist" 2> /dev/null)
    sudo -n mkdir -p "/Library/Managed Preferences" 2> /dev/null
    sudo -n defaults write "/Library/Managed Preferences/$bid" ForceForegroundPriorityForUrls -array "127.0.0.1" 2> /dev/null
    sudo -n killall cfprefsd 2> /dev/null
    say "diag384: policy written $(defaults read "/Library/Managed Preferences/$bid" ForceForegroundPriorityForUrls > /dev/null 2>&1 && echo yes || echo no) for bundle $( [ -n "$bid" ] && echo found || echo missing)"
  fi
  # $CHROME_FLAGS is unquoted on purpose: one of the fixed sets above, split into its flags.
  "$CFT" --user-data-dir="$UDD" --profile-directory=Default --no-first-run --no-default-browser-check \
    --disable-search-engine-choice-screen $CHROME_FLAGS --load-extension="$R/extension" about:blank > /dev/null 2> "$ERR/chrome" 3>&- &
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
  # The login shell is bash, which reads ~/.bashrc for a command sshd runs. The image's ~/.bashrc puts Homebrew first
  # (`brew shellenv`), so the image's own node shadowed setup-node's. Unseen while their versions matched; image
  # 20261021 has 24.22.0 against setup-node's 24.22.1. The job's PATH is restored last, after the image's lines.
  printf "export PATH='%s'\n" "$(printf '%s' "$PATH" | sed "s/'/'\\\\''/g")" >> "$HOME/.bashrc"
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
  [ "$remote" = "$(node -v)" ] || { say "the device's node ($remote) is not the job's ($(node -v))"; return 1; }
}
# repl-parity's prepare checks the tested commit out in the device's parity clone, which it clones from GitHub when
# missing and refreshes with a plain `git fetch origin`; a pull request's merge commit is on no branch, so neither would
# bring it. The clone is made here from this checkout, which holds the commit, and its origin pointed back at GitHub for
# prepare's fetch; fresh, it is clean, as prepare requires.
PARITY_CLONE=$HOME/Developer/GitHub/cua-parity
parity_clone() {
  if [ ! -d "$PARITY_CLONE/.git" ]; then
    mkdir -p "$(dirname "$PARITY_CLONE")" && quiet clone git clone -q "$R" "$PARITY_CLONE" || return
  fi
  quiet clone-fetch git -C "$PARITY_CLONE" fetch -q "$R" HEAD || return
  quiet clone-origin git -C "$PARITY_CLONE" remote set-url origin https://github.com/SSFSKIM/cua || return
  git -C "$PARITY_CLONE" cat-file -e "$1^{commit}" 2> /dev/null || { say "the parity clone lacks the tested commit"; return 1; }
}
prepare() {
  p_commit=$(git rev-parse HEAD) || return
  parity_clone "$p_commit" || return
  quiet prepare node scripts/repl-parity.mjs prepare --device "$DEVICE" --commit "$p_commit" --profile harness > "$S/prepare.json" || return
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
mark() { node -e 'require("fs").appendFileSync(process.argv[1], JSON.stringify({k:"win", lane:process.argv[2], suite:process.argv[3], phase:process.argv[4], t:Date.now()})+"\n")' "$DIAG/windows.jsonl" "$@" 2>> "$ERR/mark"; }
run() {
  r_dir=$RUNS/$1-$2 r_code=0
  mark "$1" "$2" start
  quiet "run-$1-$2" node scripts/repl-parity.mjs run --device "$DEVICE" --host "$1" --suite "$2" --out "$r_dir" > "$r_dir.out" || r_code=$?
  mark "$1" "$2" end
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
# The stream must still be up when the suites end, or the judgement would read a truncated log. It is stopped as a user
# stops it, with SIGINT, on which `log` exits 0 (sudo passes its status on), and the file is read only after it has
# exited, so no record is still being written. One that has not exited in 30 s is killed and the step fails.
stream_stop() {
  s_alive=no
  kill -0 "$LOGPID" 2> /dev/null && s_alive=yes
  ( sleep 30; sudo -n pkill -KILL -f "log stream --style ndjson" ) > /dev/null 2>&1 3>&- &
  s_watchdog=$!
  sudo -n pkill -INT -f "log stream --style ndjson" 2> /dev/null
  s_status=0
  wait "$LOGPID" 2> /dev/null || s_status=$?
  kill "$s_watchdog" 2> /dev/null; wait "$s_watchdog" 2> /dev/null
  say "log stream up until the suites ended: $s_alive; exited on SIGINT: $([ $s_status = 0 ] && echo yes || echo "no (status $s_status)"); $(wc -l < "$S/denials.ndjson" | tr -d ' ') lines recorded"
  [ $s_alive = yes ] && [ $s_status = 0 ]
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
  node "$H/diag384-sample.mjs" "$DIAG" > /dev/null 2> "$ERR/sampler" 3>&- &
  SAMPLER=$!
  say "diag384: order $ORDER"
  if [ "$ORDER" = cua-first ]; then FIRST=cua SECOND=vendor; else FIRST=vendor SECOND=cua; fi
  for suite in api docs-profiles; do
    sides=$ok
    [ "$suite" != api ] || stress_start
    gated $ok "$FIRST host, suite $suite" run $FIRST "$suite" || sides=no
    gated $ok "$SECOND host, suite $suite" run $SECOND "$suite" || sides=no
    stress_stop
    gated $sides "diff $suite: no undeclared difference" diff_suite "$suite"
  done
  kill "$SAMPLER" 2> /dev/null; SAMPLER=''
  node "$H/diag384.mjs" "$DIAG" 2> "$ERR/diag384" | sed 's/^/hosted-parity: /' >&3
fi

# --- cleanup -------------------------------------------------------------------------------------------------------
cleanup_prepared() { quiet cleanup-prepared node scripts/repl-parity.mjs cleanup-prepared --device "$DEVICE" > /dev/null && prepared=no; }
[ $prepared = no ] || step "repl-parity cleanup-prepared" cleanup_prepared

printf '\nhosted-parity summary (%s)\n%s' "$ITEM" "$results" >&3
if [ "$failed" -gt 0 ]; then
  say "$failed step(s) failed"; exit 1
fi
say "every step passed"
