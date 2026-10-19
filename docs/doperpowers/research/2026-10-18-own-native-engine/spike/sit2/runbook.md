# Second mini input sitting (#117): runbook

Spec: `docs/doperpowers/specs/2026-10-18-own-native-engine-design.md`, the Decision Log's delegated unknowns. This sitting resolves U2, U3, U4, U5, U6, U9, U10, U12 and U13 (the route-3 side-effect checks). U7 and U8 are optional, in the last phase. U1 is a reading task and U11 is closed.

Branch `feat/117-sit2`; `<sha>` below is its head when the hold starts. Run everything from the MacBook in `/Users/new/Developer/GitHub/cua-117-sit2`, which drives the mini over SSH. The mini runs only inside a CI-opt hold.

`OUT=docs/doperpowers/research/2026-10-18-own-native-engine/spike/sit2` throughout. `HOME_V='/Users/new/Library/Application Support/cua-spike-vendor'` is the mini's scratch vendor home from the first sitting. `NODE=/opt/homebrew/bin/node`.

**Stopping.** Phases run in order. Each phase writes its own output directory, so the run can stop after any phase and what is done stays usable. Grant changes come late:
- Input Monitoring is toggled only in phase 6.
- The bundle id and path experiments (U7, U8) and the `tccutil` reset come last, in phase 8.

**Owner steps** are marked **OWNER**. Each says what the owner sees and what they do; the coordinator relays them in Korean. Between owner steps the owner's hands stay off the console. The harness refuses whenever another app takes the front.

**Operator prompts.** An interactive command (approve, `--operator`, probe-f) reads its answers on stdin. Run it in the background with stdin from a fifo the controller holds open, and answer with `printf '\n'` (yes) or `printf 'n\n'` (no) once the owner reports:

```
mkdir -p /tmp/cua-sit2 && mkfifo /tmp/cua-sit2/ctl.fifo
( exec 3<>/tmp/cua-sit2/ctl.fifo; <command> < /tmp/cua-sit2/ctl.fifo > /tmp/cua-sit2/<phase>.log 2>&1; echo "exit $?" >> /tmp/cua-sit2/<phase>.log )
```

**Expected length:**
- phases 0–7: about 2 h 40 min, plus the owner's prompts;
- phase 8, if taken: about 40 min more;
- hold to ask for: 3 h 30 min.

---

## Phase 0: the signing keychain for M1b (OWNER, about 5 min)

M1b's `buildEngine` signs on the mini. `codesign` must not prompt for the keychain there.

**OWNER**, in Terminal.app at the mini's console (not over SSH, because the password must be typed by the owner):
```
security set-key-partition-list -S apple-tool:,apple:,codesign: -s ~/Library/Keychains/login.keychain-db
```
It asks for the login keychain password; the owner types it. It may print a long list of keys; that is expected.

Controller, non-interactive check that codesign with the approved identity no longer prompts. The identity is looked up by SHA-1 and never written down:
```
ssh mini 'ID=$(security find-identity -v -p codesigning | awk "/\"Apple Development:/{print \$2; exit}"); f=$(mktemp /tmp/cua-sign-check.XXXX); cp /usr/bin/true "$f"; \
  if codesign --force --sign "$ID" --timestamp=none "$f" < /dev/null; then echo signed-without-prompt; else echo "codesign failed: $?"; fi; rm -f "$f"'
```
If the owner sees a keychain dialog at the console during this check, they press **Deny**. The controller then records "codesign still prompts" in `$OUT/phase0.txt` and the sitting continues. Never type or script the password.

## Phase 1: place the build (about 15 min; OWNER once)

On the MacBook, build, sign and push (`ID` is the identity's SHA-1, as above):
```
swift build -c release --package-path native/engine --scratch-path /tmp/cua-sit2-build
node scripts/spike/engine/assemble.mjs --build /tmp/cua-sit2-build --identity "$ID" --out /tmp/cua-sit2-spike
```
Then place the checkout on the mini. The Electron fixture changed (its event counters), so rebuild it; Chrome for Testing is already placed:
```
node scripts/native-baseline.mjs prepare --device mini --commit <sha>
ssh mini 'cd ~/Developer/GitHub/cua-parity && npm ci && node scripts/spike/engine/scenes.mjs place-chrome && node scripts/spike/engine/scenes.mjs build-electron'
```
Stage the engine, in buildEngine's order:
```
node scripts/spike/engine/measure.mjs stop --device mini
ssh mini 'rm -rf "Library/Application Support/cua/engine/staging" && mkdir -p "Library/Application Support/cua/engine/staging"'
tar -C /tmp/cua-sit2-spike -cf - "cua Engine.app" | ssh mini 'tar -C "Library/Application Support/cua/engine/staging" -xf -'
ssh mini 'cd "Library/Application Support/cua/engine" && rm -rf previous && { [ -d "cua Engine.app" ] && mv "cua Engine.app" previous || true; } && mv "staging/cua Engine.app" "cua Engine.app"'
```
Approve through the fifo:
```
node scripts/spike/engine/measure.mjs approve --device mini --out $OUT/approve
```
- Grants: no grant prompt is expected (both read true). When the harness asks for Enter, the controller answers.
- **OWNER**: a screen-recording confirmation for "cua Engine" is expected. Both same-path rebuilds raised it in the first sitting. The owner clicks **Allow** and reports whether it appeared.

Then:
```
node scripts/spike/engine/measure.mjs status --device mini
ssh mini 'cd ~/Developer/GitHub/cua-parity && node scripts/spike/engine/scenes.mjs preflight --run "$HOME/Library/Caches/cua-harness/spike-scenes"'
```
Preflight refuses on any of these:
- an owner Finder window on screen;
- a hidden Finder;
- a running TextEdit.

**OWNER** if it refuses: close that Finder window or quit TextEdit, then report.

Record the owner's input source before anything types: `ssh mini 'defaults read com.apple.HIToolbox AppleSelectedInputSources'` (the first sitting's was ABC). Every run that changes it restores it.

## Phase 2: U3 and U4, Chrome and Electron background input (about 15 min)

Chrome's scene window title as the harness sees it, the corrected front check, then probes (a), (b) and (e) on Chrome. Probes (a) and (b), keys included, on Electron. TextEdit and Finder come up as the user windows.
```
node scripts/spike/engine/measure.mjs --device mini --lane cua --runs 1 --scenes textedit,finder,chrome,electron --groups ab,e \
  --probes none --approved-runtime "$HOME_V" --node $NODE --out $OUT/u3u4/cua
```
Read before going on:
- the `chrome` row `check.sceneWindow`: `frontTitle`, `accepted`, `windowTitle`, `windows`, `tabs`. The diagnosis to confirm: the first sitting's stray `-AppleLanguages (en-US)` arguments opened a second tab and changed the window title; they are dropped now.
- `probe.a.*` and `probe.b.*` on chrome and electron, with routes and `frontmostUnchanged` and `topWindowUnchanged`;
- `probe.e.typeText` on chrome, `landed`.
- If Chrome still refuses, read the logged title and go on. Chrome then waits for U3's diagnosis; nothing later depends on it.

## Phase 3: U12, U10 and U13, the route matrix and the side effects (about 30 min)

The route matrix on the four scenes:
- families: element click, coordinate click, key;
- routes: 2′ (`"2'"`), 3 and forced 2 (⌘).

Every action runs with the activation watcher, the frontmost and top-window checks, an outcome read-back, and the Electron counters. The side-effect checks follow:
- each scene window's activation point and what the hit-test finds there;
- select, then a route-3 action, then the selection read back (TextEdit, Chrome's textarea, Electron's textarea);
- the Electron counts for an activation alone.
```
node scripts/spike/engine/measure.mjs --device mini --lane cua --runs 1 --scenes textedit,finder,chrome,electron --groups routes,effects --route-samples 3 \
  --probes none --approved-runtime "$HOME_V" --node $NODE --out $OUT/u12u13/cua
```

## Phase 4: U2, the coordinate click live (about 8 min)

On TextEdit on the mini's 2× display:
- a screenshot-bearing observation;
- a target's pixel point from the tree's frame × the stored scale;
- the click by x/y, with the caret or selection read back.

Then the refusals:
- no screenshot on the connection (`coord.refusal.noScreenshot`, sent on a fresh engine connection by `measure/fresh-click.mjs`, since the spike service captures on every observation);
- the window moved (`coord.moved`, moved by `measure/move-window.swift`). This becomes a not-run row if the ssh shell is not trusted for Accessibility. That is a known limit, not an owner step: do not grant the shell anything.
- the window replaced (`coord.refusal.replaced`: super+n, then the click, then the new document closed).
```
node scripts/spike/engine/measure.mjs --device mini --lane cua --runs 1 --scenes textedit --groups coord \
  --probes none --approved-runtime "$HOME_V" --node $NODE --out $OUT/u2/cua
```

## Phase 5: U9, the four-scene speed triple on the current build (about 50 min)

The vendor lane goes FIRST: its guarded super+2 sets the shared scene folder's list view. The cua lane follows in the same sitting:
```
node scripts/spike/engine/measure.mjs --device mini --lane vendor --runs 3 --groups speed --probes c --approved-runtime "$HOME_V" --out $OUT/u9/vendor
node scripts/spike/engine/measure.mjs --device mini --lane cua    --runs 3 --groups speed --probes c --approved-runtime "$HOME_V" --node $NODE --out $OUT/u9/cua
node scripts/spike/engine/measure.mjs summary $OUT/u9
```
- **OWNER**: the vendor lane's first observation may raise the capture confirmation for the scratch home's helper copy (it did once in the first sitting). The owner clicks **Allow**.
- Chrome for Testing's own UI now follows the mini's language (Korean): the first sitting's stray `-AppleLanguages` arguments were dropped. So Chrome's browser-chrome lines and goldens differ from the first sitting's; the page's controls are unchanged. Compare Chrome within this sitting only.
- This phase needs no grant change, so it can move earlier or later if the hold is short. It is placed after the input phases because those are what M2a waits on.

## Phase 6: U5, the tap, in the ruled order (about 20 min; OWNER twice)

The order:
1. the listen-only tap under Accessibility alone;
2. the active default-option tap under Accessibility alone;
3. both again with Input Monitoring on;
4. HID idle last.

The TCC log streams throughout, filtered to the engine:
```
ssh mini 'cd ~/Developer/GitHub/cua-parity && nohup node scripts/spike/engine/grants-watch.mjs tcc-stream --out /tmp/cua-sit2-tcc-u5.jsonl > /tmp/cua-sit2-tcc-u5.pid 2>&1 < /dev/null &'
```
**OWNER, step A (Input Monitoring off).** The owner turned it on for "cua Engine" in the first sitting.
- The owner opens System Settings → Privacy & Security → Input Monitoring.
- They turn **off** the switch next to "cua Engine" and leave the entry in the list.
- If macOS offers "Quit & Reopen" for cua Engine, they choose **Later**. The harness relaunches the engine itself.
- They report when it is off.

The controller stops the engine so the next cell launches it fresh and it reads the new grant state, then runs the tap group:
```
node scripts/spike/engine/measure.mjs stop --device mini
node scripts/spike/engine/measure.mjs --device mini --lane cua --runs 1 --scenes textedit --groups tap \
  --probes none --approved-runtime "$HOME_V" --node $NODE --out $OUT/u5-ax-only/cua
```
The modes run in order, listen then active (`--tap-modes listen,active`, the default). Each `tap.create` row carries:
- `mode` and `created`;
- `listenPreflight` and `postPreflight`;
- `stop {own, driven, other, hidIdleMs, reenables, disabledBy}`;
- on refusal, `errorName` and the sentence.

For each mode that created a tap, (d)'s first checks follow (`probe.d.tap`, `probe.d.hidReset`): whether the engine's own posts reach the tap or reset HID idle, and whether the probe's HID-tap post is seen.

**OWNER, step B (Input Monitoring on).**
- The owner turns the "cua Engine" switch under Input Monitoring back **on**.
- If "Quit & Reopen" is offered, they choose **Later**.
- They report when it is on.
```
node scripts/spike/engine/measure.mjs stop --device mini
node scripts/spike/engine/measure.mjs --device mini --lane cua --runs 1 --scenes textedit --groups tap \
  --probes none --approved-runtime "$HOME_V" --node $NODE --out $OUT/u5-input-monitoring/cua
ssh mini 'kill $(head -1 /tmp/cua-sit2-tcc-u5.pid | sed "s/.*\"pid\":\([0-9]*\).*/\1/"); sleep 1; cat /tmp/cua-sit2-tcc-u5.jsonl' > $OUT/u5-tcc.jsonl
```
The phase ends with Input Monitoring on, the owner's state before the sitting, so phase 7 and any rerun see what the first sitting left.

## Phase 7: U6, probe (d)'s operator steps (about 15 min; OWNER at the console)

```
node scripts/spike/engine/measure.mjs --device mini --lane cua --runs 1 --scenes textedit,finder --groups d --operator --operator-seconds 10 \
  --probes none --approved-runtime "$HOME_V" --node $NODE --out $OUT/u6/cua
```
Run it through the fifo. The harness prints each operator step and waits. The controller relays each step to the owner and answers Enter when the owner reports done:

1. **Concurrent keystroke.** A long `type_text` runs into the driven app (about 3 s of typing). As soon as the coordinator says "now", the owner presses one letter key on the mini's keyboard, with the user window in front. The owner sees text appearing in the driven window and types nothing else.
2. **Click into the background window.** The owner clicks once anywhere inside the driven app's window, which is behind the user window, while the driven action runs. The owner sees that window come forward; that is expected.
3. **The sheet variant**, if the harness asks for it: the same single keystroke while the driven app's document shows a "Save changes?" sheet. The owner does not click the sheet.

The operator steps use the first tap mode that phase 6 found creatable. The harness records the post times against each action's interval (`drivenInsideAction`, `otherInsideAction`). `probe.d.noFire` is a not-run row here; it needs the speed group in the same invocation and was answered in phase 5. A step whose keystroke or click falls outside the interval is invalid, not a failure, and may be repeated once if time allows.

## Phase 8 (optional, only if the owner has time): U7 and U8 (about 40 min; OWNER throughout)

The stream runs for the whole phase:
```
ssh mini 'cd ~/Developer/GitHub/cua-parity && nohup node scripts/spike/engine/grants-watch.mjs tcc-stream --out /tmp/cua-sit2-tcc-u78.jsonl --match io.github.ssfskim.cua.engine,"cua Engine" > /tmp/cua-sit2-tcc-u78.pid 2>&1 < /dev/null &'
ssh mini 'cd ~/Developer/GitHub/cua-parity && node scripts/spike/engine/grants-watch.mjs capture-approvals' > $OUT/u8-approvals-0.json
```
`capture-approvals` prints `readable: false` if the plist cannot be read over SSH (it may need Full Disk Access). Record that; U8 then rests on the stream and the owner's answers.

**U7, approve on a bundle id TCC has never seen.** On the MacBook, assemble the same build under another id:
```
node scripts/spike/engine/assemble.mjs --build /tmp/cua-sit2-build --identity "$ID" --out /tmp/cua-sit2-u7 --bundle-id io.github.ssfskim.cua.engine.u7
ssh mini 'mkdir -p "Library/Application Support/cua/engine-u7"'
tar -C /tmp/cua-sit2-u7 -cf - "cua Engine.app" | ssh mini 'tar -C "Library/Application Support/cua/engine-u7" -xf -'
node scripts/spike/engine/measure.mjs stop --device mini
node scripts/spike/engine/measure.mjs approve --device mini --approved-engine "/Users/new/Library/Application Support/cua/engine-u7/cua Engine.app" --out $OUT/u7
```
This bundle shows as "cua Engine probe".

**OWNER**: say what appears.
- If an Accessibility prompt ("cua Engine probe would like to control this computer…") appears, the owner clicks **Open System Settings**, turns the switch on, and reports.
- If a Screen Recording prompt appears, the owner allows it.
- If nothing appears within about 20 s, the owner reports "nothing". Then the owner adds it by hand, as in the first sitting: Privacy & Security → Accessibility → "+" → the path `~/Library/Application Support/cua/engine-u7/cua Engine.app`, and the same under Screen & System Audio Recording.
- The capture confirmation: Allow.

The controller records the owner's answers in `$OUT/u7/owner.txt`. The prompts are raised by the engine itself; nothing is clicked or scripted.

Only if U7 shows a prompt for the fresh id: one more step tells whether the engine's own id is in a state that suppresses it.
- **OWNER** runs, at the console: `tccutil reset Accessibility io.github.ssfskim.cua.engine`.
- The controller then runs `measure.mjs approve --device mini --out $OUT/u7-reset`, and the owner reports whether the prompt appeared, then grants Accessibility again by the prompt or by hand.
- This comes last of all because it removes the grant every earlier phase relied on.

**U8, the capture-confirmation asymmetry.** It uses probe-f: f2 is a same-path rebuild and f3 a copy at a new path. The approvals are read before and after each move. The rebuild needs a different binary: assemble one from a scratch worktree with a one-line comment change in `Version.swift`. It is never committed; the mismatch with the checkout is only probe-f's concern:
```
git worktree add /tmp/cua-sit2-u8src <sha> && echo '// u8' >> /tmp/cua-sit2-u8src/native/engine/Sources/Engine/Version.swift
swift build -c release --package-path /tmp/cua-sit2-u8src/native/engine --scratch-path /tmp/cua-sit2-u8build
node /tmp/cua-sit2-u8src/scripts/spike/engine/assemble.mjs --build /tmp/cua-sit2-u8build --identity "$ID" --out /tmp/cua-sit2-u8
node scripts/spike/engine/measure.mjs stop --device mini --approved-engine "/Users/new/Library/Application Support/cua/engine-u7/cua Engine.app"   # U7's engine; probe-f launches the sitting's
node scripts/spike/engine/measure.mjs probe-f --device mini --out $OUT/u8
```
- At probe-f's f2 prompt, the controller stages `/tmp/cua-sit2-u8` with phase 1's stop, stage and move lines, reads `capture-approvals` into `$OUT/u8-approvals-1.json`, then answers Enter.
- **OWNER**: whether the capture confirmation appeared for the rebuild (Allow it).
- Before answering f3's prompt, the controller reads `capture-approvals` into `$OUT/u8-approvals-2.json`.
- **OWNER**: whether the confirmation appeared for the new-path copy (Allow it).
- After f3: `capture-approvals` into `$OUT/u8-approvals-3.json`, then stop the stream:
```
ssh mini 'kill $(head -1 /tmp/cua-sit2-tcc-u78.pid | sed "s/.*\"pid\":\([0-9]*\).*/\1/"); sleep 1; cat /tmp/cua-sit2-tcc-u78.jsonl' > $OUT/u78-tcc.jsonl
```

**Restore** the sitting build (another same-path move, so the confirmation is expected; **OWNER**: Allow). Use phase 1's stop, stage and move lines with `/tmp/cua-sit2-spike`, then `measure.mjs approve --device mini --out $OUT/approve-final`. Then remove the U7 bundle: `ssh mini 'rm -rf "Library/Application Support/cua/engine-u7"'`.

**OWNER**: the "cua Engine probe" entries stay in System Settings' lists. The owner may remove them with "−" (optional; nothing depends on them).

## Phase 9: teardown (about 5 min)

```
ssh mini 'cd ~/Developer/GitHub/cua-parity && node scripts/spike/engine/scenes.mjs down all --run "$HOME/Library/Caches/cua-harness/spike-scenes"'
node scripts/spike/engine/measure.mjs stop --device mini
ssh mini 'defaults read com.apple.HIToolbox AppleSelectedInputSources | grep "KeyboardLayout Name"; pgrep -lf "cua-engine|TextEdit|Chrome for Testing|cua Electron" || echo none-running'
ssh mini 'log show --start "<hold start, local>" --predicate "subsystem == \"io.github.ssfskim.cua.engine\"" --style compact' | grep -E "started pid|exiting" > $OUT/engine-exits.txt
ssh mini 'ls -l ~/Library/Logs/DiagnosticReports | grep cua-engine'
```
Count every engine start against a logged exit or a crash report; match crash reports by the pid inside, not by file time.

Commit `$OUT` with explicit paths. Only the sitting's own outputs go in: the rows carry no text of windows the harness does not own, and the Finder goldens are redacted.

## What stays unverified until the sitting

- Every new engine path: route 2′, the `probe_spike` ops, the active tap. They are unit-tested only; nothing ran against real apps on the MacBook.
- Whether the active default-option tap is creatable under Accessibility alone: the point of phase 6.
- The Chrome diagnosis: `check.sceneWindow` confirms or refutes it.
- Whether the "first text element" `probe_spike selection` finds is the scene's own field:
  - On Chrome it may be the address bar's. The row records `role`, and `effects.selection` types its probe text into the page's field first.
  - If it is the address bar, the Chrome selection rows say nothing about the page.
- The coordinate rows: TextEdit's line height (taken from the frame, else a 17 pt estimate, ±1 line tolerated), and `coord.moved` needing an Accessibility-trusted ssh shell.
- The Electron rows: whether its focus reads in the background (the Tab outcome may be null), and the counters' 500 ms settle.
- The fifo relay of the operator prompts end to end, and the 10 s operator text length.
- The Electron fixture's counters, and Chrome's corrected front check and translate suppression.
- Whether replayd's approvals plist is readable over SSH.
- Whether a staged rebuild keeps the Input Monitoring grant: phase 6's preflight rows show it.
