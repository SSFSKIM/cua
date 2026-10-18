#!/bin/bash
# #159 spikes on GitHub's hosted macOS runner: a harness Chrome (Chrome for Testing, cua's extension loaded unpacked,
# cua's host registered) in a throwaway profile, the parity harness reaching the runner itself as its device over a
# loopback ssh alias, then
#   cfprefs  cua's own host's cells and services suites under `log stream`, the denials reduced and judged against a
#            declared set (scripts/spike-159/cfprefs-declared.json);
#   parity   the vendor and cua hosts over the browser lanes (suites api and docs-profiles), diffed against
#            test/repl-parity/expected-differences.json.
# The logs are public: only labels, outcomes, counts and booleans are printed; raw logs and run directories stay on the
# runner. Usage: bash scripts/spike-159/hosted.sh [cfprefs] [parity]
set -u
ITEMS=${*:-cfprefs parity}
REPO=$(pwd)
W=${RUNNER_TEMP:-/tmp}/spike159
rm -rf "$W"; mkdir -p "$W"
failed=0
say() { echo "spike159: $*"; }
step() { label=$1; shift; if "$@"; then say "$label: ok"; else say "$label: FAILED (exit $?)"; failed=$((failed + 1)); return 1; fi; }
js() { node -e "$1" "${@:2}"; }

say "macOS $(sw_vers -productVersion) $(uname -m); node $(node -v); user-is-admin $(id -Gn | grep -qw admin && echo yes || echo no)"

# --- 1. Chrome for Testing -------------------------------------------------------------------------------------------
CFT=""
for app in "/Applications/Google Chrome for Testing.app"; do
  [ -x "$app/Contents/MacOS/Google Chrome for Testing" ] && CFT="$app/Contents/MacOS/Google Chrome for Testing"
done
say "preinstalled Chrome for Testing: $([ -n "$CFT" ] && echo yes || echo no); branded Chrome: $([ -d '/Applications/Google Chrome.app' ] && echo yes || echo no)"
if [ -z "$CFT" ]; then
  step "install Chrome for Testing (stable)" sh -c "cd '$W' && npx -y @puppeteer/browsers install chrome@stable --path '$W/cft' >/dev/null 2>&1"
  CFT=$(find "$W/cft" -type f -path '*Contents/MacOS/Google Chrome for Testing' | head -1)
fi
[ -n "$CFT" ] && say "Chrome for Testing version: $("$CFT" --version 2>/dev/null | awk '{print $NF}')"

# --- 2. The discovery home: cua install, cua's host registered -------------------------------------------------------
CUA_HOME_D="$HOME/Library/Application Support/cua"
step "cua install (discovery home)" sh -c "node bin/cua.mjs install --json > '$W/install.json' 2> '$W/install.err'" || tail -c 600 "$W/install.err" | sed 's/^/  install stderr: /'
step "cua chrome register" sh -c "node bin/cua.mjs chrome register --json > '$W/register.json' 2> '$W/register.err'" || tail -c 600 "$W/register.err" | sed 's/^/  register stderr: /'
NMH="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/io.github.ssfskim.cua.json"
say "native host manifest in Google/Chrome: $([ -f "$NMH" ] && echo yes || echo no); allowed origin is the extension id: $(grep -q 'chrome-extension://jkejaaijdfpohkdhankllbekkhmnippb/' "$NMH" 2>/dev/null && echo yes || echo no)"
# Chrome for Testing's own default data directory, in case it does not take the manifest from --user-data-dir.
mkdir -p "$HOME/Library/Application Support/Google/Chrome for Testing/NativeMessagingHosts"
cp "$NMH" "$HOME/Library/Application Support/Google/Chrome for Testing/NativeMessagingHosts/" 2>/dev/null

# --- 3. The harness Chrome ---------------------------------------------------------------------------------------------
UDD="$HOME/Library/Application Support/Google/Chrome"
launch() {
  mode=$1
  "$CFT" --user-data-dir="$UDD" --profile-directory=Default --no-first-run --no-default-browser-check \
    --disable-search-engine-choice-screen --load-extension="$REPO/extension" $([ "$mode" = headless ] && echo --headless=new) \
    about:blank > "$W/chrome-$mode.log" 2>&1 &
  echo $! > "$W/chrome.pid"
}
backend_live() {
  node bin/cua.mjs profiles bind harness --dry-run --json > "$W/bind-dry.json" 2>/dev/null
  js 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.exit((r.backends??[]).length>0?0:1)' "$W/bind-dry.json" 2>/dev/null
}
ready=no
if [ -n "$CFT" ]; then
  for mode in headful headless; do
    launch $mode
    n=0; while [ ! -d "$UDD/Default" ] && [ $n -lt 60 ]; do sleep 1; n=$((n+1)); done
    [ $mode = headful ] && { node bin/cua.mjs profiles add harness --chrome-profile Default --json > "$W/add.json" 2> "$W/add.err"; say "profiles add harness: exit $?"; }
    n=0; while [ $n -lt 45 ]; do backend_live && break; sleep 2; n=$((n+1)); done
    say "$mode: extension store present $([ -d "$UDD/Default/Local Extension Settings/jkejaaijdfpohkdhankllbekkhmnippb" ] && echo yes || echo no); live backend $(backend_live && echo yes || echo no) after ~$((n*2))s"
    if backend_live; then ready=$mode; break; fi
    kill "$(cat "$W/chrome.pid")" 2>/dev/null; sleep 3
  done
fi
if [ "$ready" != no ]; then
  node bin/cua.mjs profiles bind harness --json > "$W/bind.json" 2> "$W/bind.err"; rc=$?
  js 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(`spike159: bind: ok ${r.ok} how ${r.how??r.outcome} by ${r.by??r.reason??"-"} backends ${(r.backends??[]).length}`)' "$W/bind.json" 2>/dev/null || say "bind: exit $rc"
  if ! js 'process.exit(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).ok?0:1)' "$W/bind.json" 2>/dev/null; then
    id=$(js 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const b=r.backends??[];if(b.length===1)console.log(b[0].instanceId)' "$W/bind.json")
    [ -n "$id" ] && step "bind with the one live backend's id" sh -c "node bin/cua.mjs profiles bind harness --extension-instance-id '$id' --json > '$W/bind2.json' 2>/dev/null"
  fi
fi
node bin/cua.mjs profiles list --json > "$W/list.json" 2>/dev/null
js 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));for(const p of r.profiles??[])console.log(`spike159: profile ${p.key}: ready ${p.ready} reason ${p.reason??"-"} bound ${!!p.extensionInstanceId}`);if(r.listingError)console.log("spike159: listingError "+r.listingError.code)' "$W/list.json" 2>/dev/null || say "profiles list unreadable"

# --- 4. The runner as its own parity device: a loopback ssh alias ------------------------------------------------------
S="$W/sshd"; mkdir -p "$S" "$HOME/.ssh"; chmod 700 "$HOME/.ssh"
ssh-keygen -q -t ed25519 -N '' -f "$S/hostkey"; ssh-keygen -q -t ed25519 -N '' -f "$HOME/.ssh/spike159"
cat "$HOME/.ssh/spike159.pub" >> "$HOME/.ssh/authorized_keys"; chmod 600 "$HOME/.ssh/authorized_keys"
echo "PATH=$PATH" > "$HOME/.ssh/environment"
cat > "$S/sshd_config" <<EOF
Port 2222
ListenAddress 127.0.0.1
HostKey $S/hostkey
PidFile $S/sshd.pid
AuthorizedKeysFile $HOME/.ssh/authorized_keys
PasswordAuthentication no
KbdInteractiveAuthentication no
UsePAM no
StrictModes no
PermitUserEnvironment yes
EOF
cat >> "$HOME/.ssh/config" <<EOF
Host hosted-macos
  HostName 127.0.0.1
  Port 2222
  User $USER
  IdentityFile $HOME/.ssh/spike159
  IdentitiesOnly yes
  StrictHostKeyChecking no
  UserKnownHostsFile /dev/null
  LogLevel ERROR
EOF
step "user-mode sshd on loopback" /usr/sbin/sshd -f "$S/sshd_config" -E "$S/sshd.log"
sleep 1
step "ssh hosted-macos reaches this runner with the job's node" sh -c "ssh -o BatchMode=yes hosted-macos 'node -v' | grep -q '^v24'"

COMMIT=$(git rev-parse HEAD)
prepared=no
if [ "$ready" != no ]; then
  if node scripts/repl-parity.mjs prepare --device hosted-macos --commit "$COMMIT" --profile harness > "$W/prepare.json" 2> "$W/prepare.err"; then
    prepared=yes; say "prepare: ok"
  else
    say "prepare: FAILED"; failed=$((failed + 1)); tail -c 1500 "$W/prepare.err" | sed 's/^/  prepare stderr: /'
  fi
fi

summary() { tail -1 "$1" | js 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const r=JSON.parse(s);console.log(`cases ${r.cases} complete ${r.complete} assertions ${r.assertions} covered ${r.coveredCases?.length??r.coveredCases} vendorDefects ${r.recordedVendorDefects}`)}catch{console.log("no summary")}})'; }
failures() { js 'const fs=require("fs"),p=require("path");const d=process.argv[1];try{const m=JSON.parse(fs.readFileSync(p.join(d,"meta.json"),"utf8"));if(m.error)console.log("  meta.error: "+String(m.error).slice(0,300));const rows=fs.readFileSync(p.join(d,"results.jsonl"),"utf8").trim().split("\n").filter(Boolean).map(JSON.parse);const bad=rows.filter(r=>r.assertion&&r.assertion.ok===false&&!r.vendorDefect);for(const r of bad.slice(0,30))console.log("  failed assertion: "+r.case);console.log("  rows "+rows.length+" failed assertions "+bad.length)}catch(e){console.log("  no run record: "+e.code)}' "$1"; }
run() { # host suite out
  if node scripts/repl-parity.mjs run --device hosted-macos --host "$1" --suite "$2" --out "$3" > "$3.out" 2> "$3.err"; then
    say "run $1 $2: ok, $(summary "$3.out")"
  else
    say "run $1 $2: FAILED, $(summary "$3.out")"; failures "$3"; failed=$((failed + 1))
  fi
}

# --- 5. cfprefs ----------------------------------------------------------------------------------------------------------
if [ $prepared = yes ] && echo "$ITEMS" | grep -qw cfprefs; then
  sudo log stream --style ndjson --predicate 'sender == "Sandbox"' > "$W/denials.ndjson" 2>/dev/null &
  LOGPID=$!; sleep 2
  say "log stream running: $(kill -0 $LOGPID 2>/dev/null && echo yes || echo no)"
  for suite in cells services; do start=$(date +%s); run cua $suite "$W/cfprefs-$suite"; say "  took $(( $(date +%s) - start ))s"; done
  sudo pkill -f "log stream --style ndjson" ; sleep 1
  say "denial log lines: $(wc -l < "$W/denials.ndjson" | tr -d ' ')"
  step "cfprefs denials within the declared set" node scripts/spike-159/denials-within.mjs "$W/denials.ndjson" scripts/spike-159/cfprefs-declared.json
  rm -f "$W/denials.ndjson"
fi

# --- 6. parity's browser lanes -----------------------------------------------------------------------------------------
if [ $prepared = yes ] && echo "$ITEMS" | grep -qw parity; then
  for suite in api docs-profiles; do
    for host in vendor cua; do start=$(date +%s); run $host $suite "$W/parity-$suite-$host"; say "  took $(( $(date +%s) - start ))s"; done
    if [ -f "$W/parity-$suite-vendor/meta.json" ] && [ -f "$W/parity-$suite-cua/meta.json" ]; then
      node scripts/repl-parity.mjs diff "$W/parity-$suite-vendor" "$W/parity-$suite-cua" --expected test/repl-parity/expected-differences.json > "$W/diff-$suite.json" 2> "$W/diff-$suite.err"
      js 'const fs=require("fs");let r;try{r=JSON.parse(fs.readFileSync(process.argv[1],"utf8"))}catch{console.log("spike159: diff '"$suite"': no result: "+fs.readFileSync(process.argv[2],"utf8").slice(0,300));process.exit(1)}const u=r.differences??r.unexpected??[];console.log(`spike159: diff '"$suite"': ok ${r.ok} undeclared ${u.length} expected ${(r.expected??r.allowed??[]).length??"-"}`);for(const d of u.slice(0,20))console.log(`  undeclared: ${d.kind??"-"} ${d.case??""} ${d.cell??""} ${d.field??""}`);process.exit(r.ok?0:1)' "$W/diff-$suite.json" "$W/diff-$suite.err" || failed=$((failed + 1))
    else
      say "diff $suite: a side has no run"; failed=$((failed + 1))
    fi
  done
fi

# --- cleanup -------------------------------------------------------------------------------------------------------------
[ $prepared = yes ] && { node scripts/repl-parity.mjs cleanup-prepared --device hosted-macos > /dev/null 2>&1; say "cleanup-prepared: exit $?"; }
kill "$(cat "$W/chrome.pid" 2>/dev/null)" 2>/dev/null; kill "$(cat "$S/sshd.pid" 2>/dev/null)" 2>/dev/null
say "done: $failed failure(s)"
[ $failed -eq 0 ]
