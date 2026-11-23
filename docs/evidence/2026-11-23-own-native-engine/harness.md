# T10b′ part 1: what the matrix records (M5 wave 1, refs #506, #485)

Task 6b-1 of `docs/doperpowers/specs/2026-10-18-own-native-engine-m5-wave1.md`: the matrix harness's records, proven
against the run's doubles. No live run, no GUI, no hosted run, no Mac mini; part 2 (hosted plumbing) takes these records
to the runner.

Commits on `feat/117-m5`:

- `6dbb41172` the window-order oracle, a target window left above the person's fails the row (refs #485)
- `9bbd54202` what the matrix records about each judged act (refs #506)
- `c08c57566` this report (refs #506)
- Fix wave 1: `73f1244d2` the engine's own error name as `cua/errorName`, `44bef444c` the matrix fixes, and this report's
  update (all refs #506; see "Fix wave 1" at the end)

## What was implemented

1. **Front/key readings around every judged act** (`scripts/native-matrix/front-key.mjs`'s contract, rulings 1136
   and 1141).
   - Device: `matrix-device.mjs read --with front-key,window-order`. The front app comes from the front-window
     probe's lsappinfo reading. The key app comes from the focus probe's system-wide focused application: the `--focus`
     report when the read has one, else a `--probe focus` naming no window. Both are bundle ids or null.
   - `step activate <scene>` also answers `frontKey`, its own check (`activationCheck`). It reads front and key up to
     4 times, 250 ms apart, while either is not the scene's app, because the key follows the front asynchronously.
     There is no new privileged path: these are the same front-window and focus probes the oracle already runs.
   - Controller (`steps.mjs`): `step()` keeps the last activation and its check in `ctx.activated`. The row's
     `frontKey.activate` is that check when it was the row's activated app's, else `{front: false, key: false}`.
   - The frontmost regime reads front and key after the prepare (`drivenFront`). When the scene is not front and key,
     the run activates it again and reads again. The Open panel is never re-activated, because activating TextEdit
     could bring it up over its own panel.
   - The background regime does the same for the user window's app (`userFront`, now reading front, key and window
     order). The composing Unicode rows pass `rekey: false`, because an activation could end the composition they
     hold.
   - `frontKey.after` is read after the act's check, and after the witness when there is one.
   - **Skipped act:** when the activation did not take front and key, the act is not sent. The row is pushed with
     `ok: false`, no `invalid`, and `frontKey.after: null`, which `front-key.mjs` reads as `activation`.
   - Speed and finding rows carry the readings around their series. The method timings copy their case's. The launch
     row, the probe cells (concurrent use, the sheet variant, fires, preAction, the save sheet) and the Unicode rows
     (method and mid-switch) carry their own.
   - Meta: `meta.hosted` is `RUNNER_ENVIRONMENT === 'github-hosted'` (`io.env ?? process.env`). `meta.desktopMode` is
     `'shared'`.
2. **The engine's own error name.**
   - Rows take `act.engine.errorName`, the act's `cua/errorName` result meta (`lane.mjs engineMetaOf`), when it is
     present (`steps.mjs errorNameOf`). Otherwise they keep the name the cell caught.
   - This covers outcome rows, probe cells, the sheet's follow-up, fires' `nextErrorName` and the mid-switch row.
   - The boundary does drop the name; see "Discoveries" for where. Fix wave 1 made the change proposed there.
3. **`outcome.unchanged` and `outcome.effect`** (earlier in the task; in commit `9bbd54202`).
   - `plan.mjs WATCHED` gives one watched-state expression per target. The prepare cell keeps
     `__m.watched = JSON.stringify(<watched>)` once ready.
   - An outcome case whose act threw re-reads the same expression from the fixture. Its check returns
     `effect: <its own check's ok>` and `unchanged: <watched equal>`. Both are read back, never inferred, and only
     booleans leave the cell.
   - This covers method cases and fixed-string Unicode rows (`unicodeCase` is an outcome case on its field's target).
4. **No contradictory rows.**
   - `cell-result.mjs rowProblems` flags `ok: true` with `outcome.userKept === false`, and `ok: true` with
     `outcome.exact === false`, so `writeCellResult` refuses them.
   - The opposite case (exact true, ok false) is legitimate: an unconfirmed answer that landed, or concurrent use
     where `ok` needs more than the read-back.
   - The committed holds: 33 results, 0 contradictions (checked earlier in the task).
5. **Acceptance 3's keystroke witness** (S L238) in `textedit/background/click.element@finder` (`plan.mjs
   isAcceptance3`). The steps run after the click's check:
   - `WITNESS_PREPARE_CELL` picks `scene-file-007`, or `-008` when 007 is already the sole selection.
   - A `probe keystroke` gated on the run's Finder window types that name with a 1.5 s lead, followed by `probe finish`.
   - `ctx.posted.finder` is set so the run waits out the debounce before it next drives Finder.
   - `witnessCheckCell` returns `{finderSelected, documentUnchanged}`. It compares the file as the sole selection with
     TextEdit's value against the click prepare's `__m.before`.
   - The result is recorded as `outcome.keystroke {posted, finderSelected, documentUnchanged}`, and the row's `ok`
     requires all three.
   - A probe aborted because the window was no longer in front makes the witness fail (`posted: false`). Any other
     probe problem makes the row invalid (`/keystroke witness/`).
6. **The window-order oracle for #485.**
   - Every background case row, the launch row, and the concurrent and sheet probe cells read the window order before
     and after the act. `read --with window-order` lists every on-screen window front to back at all layers: the run's
     own by pid, number, bundle id and layer; any other app's by bundle id and layer only; the engine's own windows
     passed over.
   - `oracle.mjs targetAbove` and `judgeInterference({order, targets, userWindow})` fail the row when a target window
     sits above the person's after the act, or when the order was unread after it. The result rides on the row as
     `interference.windowOrder {before, after}`.
   - Targets are the driven app's bundle id, plus `com.apple.appkit.xpc.openAndSavePanelService` for the Open panel and
     the launched app for the launch row. The user window is identified by its pid and its top-window number before
     the act.

## Tests

Final state:
- `node --test test/native-matrix/*.test.mjs test/cursor-sitting/item-187.test.mjs test/cursor-sitting/item-188.test.mjs test/repl-parity/native-mac-run.test.mjs`:
  **519/519 pass**, and the dot reporter prints nothing else (pristine).
- Broader sibling check: `node --test test/cursor-sitting/*.test.mjs test/repl-parity/*.test.mjs` gives **1015/1015
  pass**.

New and changed tests:
- `test/native-matrix/run-records.test.mjs` (new, 9 tests, against the run doubles):
  - a hosted run's readings and meta
  - an activation that kept the alert key: act skipped, cause `activation`
  - the frontmost re-activation (one more activate; the Open panel never re-activated)
  - `cua/errorName` recorded, or the cell's name kept without it
  - #485: the target left above the person's window fails exactly that row
  - Acceptance 3: pass, document changed, selection unmoved, aborted, broken probe
  - the launch row's readings and window order
  - the speed, finding and timing rows' readings
  - the full plan: no judged row without readings; a valid concurrent-use row's readings and window order
- `matrix-device.test.mjs`: three new tests: front/key as bundle ids, the window order's redaction, the activation
  check's polling. Probe `--text` now accepts inner dashes.
- `oracle.test.mjs`: the window-order test.
- `front-key.test.mjs`: an invalid row without readings keeps its own reason.
- `cell-result.test.mjs`: the contradiction rule.
- `plan.test.mjs`: `unchanged`/`effect` for a thrown Electron `typeText.replace` and a fixed-string Unicode row.
- `probe-plan.test.mjs`: the witness cells against the Finder and TextEdit goldens. The prepare picks 007, or 008 when
  007 is selected; the check reports only the file selected and the document unchanged as true.
- `run.test.mjs` (updated):
  - The background pairing's step order now includes the witness's `probe keystroke`/`probe finish`.
  - The key-guard test now makes the front/key readings show TextEdit, so it still exercises the guard.
  - A new assertion covers the honest reading: an activation that left Finder in front skips TextEdit's acts (no
    invalid rows, nothing sent to the key guard).
- `run-doubles.mjs`: `runWith({env})` passes `io.env`. `lane.mjs` dryOps/dryConnect answer `--with` and the step's
  `frontKey`, plus the witness cells' values.

### TDD evidence

- RED `node --test test/native-matrix/run-records.test.mjs` before any plumbing gave `# pass 0  # fail 9` (every test
  failed on missing `meta.hosted`, missing `frontKey`, missing `outcome.errorName`, `windowOrder` and `keystroke`).
  This was expected: nothing wrote them yet.
- Midway it gave `# pass 2  # fail 7`, then `# pass 4  # fail 5` once `caseRow` was done; the rest needed `run.mjs`,
  `probe-run.mjs` and `unicode-run.mjs`. GREEN: `# pass 9  # fail 0`.
- RED for the unit tests, each run before its implementation:
  - `matrix-device.test.mjs`: tests 20, 21, 22 (`read: front and key…`, `read: the window order…`,
    `the activate step's own check…`)
  - `oracle.test.mjs`: failed to load (`targetAbove` not exported)
  - `cell-result.test.mjs`: 12 (`a row may not say ok against its own reading…`)
  - `front-key.test.mjs`: 20 (`a hosted sample the harness left invalid…`)
  - `plan.test.mjs`: 25 and 26 (`an act that threw records…`, `a fixed-string Unicode row whose act threw…`)
  - All are GREEN now.
- Two corrections to my own RED tests while going GREEN. Both were the test's fault, not the code's:
  - The re-activation test's alert injection counted every read rather than injecting once.
  - The witness test steered `probe finish`'s outer answer, while the device answers `{answer: <probe's answer>}` as
    the other probe callers read it.
  - A third fix: the Open-panel assertion needed its own `openPanel` plan.

## Files changed

- `scripts/native-matrix/`: `matrix-device.mjs`, `lane.mjs`, `steps.mjs`, `run.mjs`, `probe-run.mjs`, `unicode-run.mjs`,
  `probe-plan.mjs`, `plan.mjs`, `matrix-cells.mjs`, `oracle.mjs`, `front-key.mjs`, `cell-result.mjs`
- `test/native-matrix/`: `run-records.test.mjs` (new), `matrix-device`, `oracle`, `front-key`, `cell-result`, `plan`,
  `probe-plan`, `run` tests, `run-doubles.mjs`

## Decisions made

- **The activate check lives on the device, in `step activate`.** It polls up to 4 × 250 ms, because the key lags the
  front. The controller keeps the last check (`ctx.activated`), and each row's `activate` is that check when it was the
  row's app's.
  - Why: the check has to be the activation's own, read inside the step's window, so the activation watcher excuses
    it as the harness's.
- **The act is skipped when the activation did not take.** The row is `ok: false` with no `invalid` and
  `frontKey.after: null`.
  - Why: front-key.mjs's documented shape for a skipped act. Ruling 1141 makes it NO VERDICT, never FAIL, and the
    judge orders `activation` before `invalid`.
- **Rows left invalid before any reading carry no `frontKey`**, and `sampleCause` reports their own `invalid` reason
  rather than `unread`.
  - Why: a missing reading is not what kept their verdict, and the harness's reason is the useful one.
  - Activation failures reported by the scenes command itself (`front?.ok` false) stay `invalidCases` as before.
- **The frontmost regime has its own activate step.** It reads before the act; when the scene is not front and key it
  activates again and re-reads. The Open panel is excluded.
  - Why: ruling 1136/1141, "alert up, scene activated first". Activating TextEdit over its own panel would change what
    the panel cases drive.
  - The panel's key may read as its XPC service; the judge does not compare key to the app outside `activate`, so
    that reading is harmless.
- **The background regime re-activates when the key is not the user app** (formerly only when the user window was not
  in front). Composing rows are exempt (`rekey: false`).
  - Why: same rulings. A composition would end on activation.
- **`frontKey.after` is a separate read after the check and the witness**, apart from the oracle's after-read, which
  stays between the act and the check.
  - Why: the contract says "after the act and its check". Moving the oracle's read would change the act-to-check timing
    the earlier holds compared.
- **Speed readings are per call** (fix wave 1; first built as one reading pair per series). Each sample reads front and
  key at its own call's two boundaries. The reading after one call is the next call's before, since nothing runs between
  them. After the screenshot series' scratch guard (a cell of its own), the next series reads afresh. The finding cell
  is one call, read around it.
- **The witness runs only in `textedit/background/click.element@finder`**, on both lanes, after the click's check.
  - It uses a dedicated prepare cell (007, or 008 when 007 is already selected) so the selection must move.
  - The probe's gate holding its keys fails the witness, at its first gate or between its keys (fix wave 1; first built
    for the mid-post `aborted` answer only). Only the probe's own faults make the row invalid.
  - The probe's `--text` grammar widened to inner dashes (`^[A-Za-z0-9][A-Za-z0-9-]{0,15}$`) to type a file name.
- **`caseRow` waits out the probe debounce of the scene it drives (`quiet`)**, because the witness's keys are a user's
  to Finder.
- **Window-order targets are the driven app's bundle ids.** The Open panel adds its XPC service; the launch row uses
  the launched app.
  - The person's window is identified by pid and its top-window number from the before-read.
  - With the person's window, known by its number, missing from the order, any target window counts as above it. An
    order without it and without a target window, or with the person's window not known, proves nothing (null).
  - An order unread after the act, or one that proves nothing, fails the row, as an unread front does (fix wave 1: an
    unread list now stays unread through `system-windows.swift` and the device, instead of reading as an empty screen).
- **`meta.desktopMode` is the constant `'shared'`.** The lane's serve runs under `env -i` with a prepared HOME
  (`scripts/native-baseline/remote.mjs`), so cua's launcher takes its default shared mode.
  - Recording what was actually launched would need the serve to report its mode, which is outside this part.
- **`meta.hosted` comes from the controller's environment.** It is correct when the device is the runner itself
  (part 2's loopback). A controller on a hosted runner driving a remote device would mislabel the run; that setup is
  not supported.
- **Only `ok: true` contradictions are refused.** `exact: true` with `ok: false` is a legitimate answer (see item 4).
- **Commits:** the oracle went in its own commit (refs #485). The rest went in one commit, because `matrix-device`,
  `steps` and `lane` interleave the readings and the window order hunk by hunk.

## Discoveries

- **Where the REPL boundary drops the error name** (verified in source):
  - The vendor `node_repl` trusted worker's `runInExecContext` sends `{ok: false, error: error.message}`, and the kernel
    rejects with `new Error(response.error || "Trusted RPC request failed")`.
  - cua's port does the same: `src/repl-host/trusted-worker.mjs:178-181` (only `error.message` crosses) and
    `src/repl-host/kernel.mjs:1586` (a plain `Error`).
  - So every cell catches `name: 'Error'` on both hosts. Hold 2a's records agree: cua run 1 `{Error: 39}`, vendor
    `{Error: 15, null: 2}`.
  - Response meta does survive a failure: `nodeRepl.setResponseMeta` posts `response_meta` at once, and `sky.mjs`
    already sets `cua/serviceMs` in its `finally`.
- **The change proposed here was made in fix wave 1** (`73f1244d2`): `src/services/sky.mjs`'s darwin `handleRpc`
  publishes `cua/errorName` in the same `finally` as `cua/serviceMs`. The value comes from a finite set of names
  (`src/services/engine/error-names.mjs`), not the regex first proposed. `ADMITTED_ERROR_NAMES` is still not used: it
  lacks several names the judge uses.
- `probe finish` answers `{answer: <the probe's own answer>}`. The witness reads `finished.answer`, as the other probe
  callers do.
- The focus probe reports `focusedApp {pid, bundleId}` without `--window`, which is what makes the key reading possible
  with no new helper.
- `front-window.swift` reads layer 0 only, so an alert's window never shows in `topWindow`. `system-windows.swift`
  reads all layers, which is why the window-order oracle can catch a target raised under an alert.

## Self-review

- Every `ok`/`invalid` path after the act carries `frontKey`. A row returned before the act carries none and keeps its
  own reason. This is checked over the full plan by `run-records` test 9.
- No value, title or bounds of another app leaves the device: the window order keeps other apps' bundle id and layer
  only, and front and key are bundle ids only.
- No replayd writes, no pre-record code, no runtime (`src/`) change.

## Concerns

- **Run time grows.** Each front/key reading without `--focus` launches the focus probe once (about 0.5 to 1 s on the
  mini, from earlier probe timings). The activate check launches it 1 to 4 times.
  - Rough estimate: about 10 more minutes per full run, more on a slow hosted runner. This was not measured; part 2
    should time one run.
- **Pilot risks** that only a live run settles:
  - The Open panel's XPC service bundle id. The baseline matches it with a `\b` regex, so a suffix is possible.
  - Whether Finder's list takes type-select keys while TextEdit was just clicked behind it. The witness expects Finder
    to keep its list focused.
  - Chrome for Testing and the Electron fixture: whether the focus probe's `focusedApp` bundle id equals their scene
    bundle ids.
- `cua/errorName` through the vendor's host is proven only by construction: the same wrapper and the same
  `nodeRepl.setResponseMeta` that already carries `cua/serviceMs` there. See fix wave 1's concerns.

## What part 2 (hosted plumbing) must provide

- **The device is the runner itself (loopback).** Then `RUNNER_ENVIRONMENT=github-hosted` in the controller's
  environment truly describes the device, and `meta.hosted` is right.
- **The probes on the runner:** the focus probe (`--probe focus` of the approved bundle) with Accessibility, plus
  `front-window.swift` and `system-windows.swift` compiled by `matrix-device compile`. The focus probe must run
  without `--window` too.
- **The keystroke probe's Accessibility/post-event grant**, for the witness and the probe cells.
- **A timing budget** that includes the extra probe launches (see Concerns), with one hosted run timed before setting
  timeouts.
- **A first pilot run that checks:** the panel service's bundle id in the window order, Finder's type-select witness
  passing on both lanes, and the scenes' `focusedApp` bundle ids matching `SCENES[*].bundleId`.
- **A check that the vendor lane's rows carry `cua/errorName`** on the pilot's first refused or unconfirmed act (fix wave
  1's concern).

## Fix wave 1

The controller's review asked for five fixes and one minor one. All six are done.

### 1. The engine's own error name (`73f1244d2`)

- **`src/services/engine/error-names.mjs` (new).** It holds the finite set of names, in one place:
  - the vendor client's ServerErrorCode names (`protocol.mjs VENDOR_CODES`, now exported) and `jsonRPCError`;
  - every `EngineError(name: "…")` in `native/engine/Sources`, plus `windowMinimized` and the `RPCCode` cases;
  - the service's own `invalidElementID`.
  `errorNameOf(error)` returns the name only for an `Error` whose `name` is `SkyComputerUseError` and whose `errorName` is
  in the set. Anything else gives null: a transport error, the wrapper's own diagnostics, an unknown name.
- **`src/services/sky.mjs` darwin `handleRpc`** catches the error, takes `errorNameOf(error)` and rethrows the same object.
  It sets `{'cua/serviceMs', 'cua/errorName'}` in one `setResponseMeta` call in its `finally`, before the rejection leaves
  the service. Every call sets the key, so a success or an unclassified failure resets it to null.
  - Results and rejections are unchanged; Linux is untouched.
  - The vendor host's wire replies to the runtime do not change. Only the wrapper's response meta gains a key, through
    the same `nodeRepl.setResponseMeta` that already carries `cua/serviceMs` on both hosts.
- **Concealed requests:** the wrapper rethrows its own diagnostic, not the engine's error, so the name is null. The
  diagnostic's message already names the kind (`vendorFailureKind`).
- **Sharing with the judge:** `answers.mjs` keeps its own lists. A test checks that `REFUSAL_NAMES` and
  `UNCONFIRMED_NAMES` are subsets of the set. A second test keeps the engine's own names equal to what the Swift sources
  raise.
- **Finder's type-select method case** (`plan.mjs`, `44bef444c`): its act is now a plain `typeText`. cua's
  `typeUnconfirmed` therefore reaches the cell's thrown-outcome path, and the row records `errorName`, `effect` and
  `unchanged`. Only a declared departure can excuse it; `departures.json` is empty until a run shows the pair.
  - Concurrent use's typing into the same list keeps `typeIntoList`. Its row is judged by both landings, and #354's
    expected difference stays there.
  - Result: until a departure is declared, cua's `finder/frontmost/typeText.typeSelect` fails where the vendor answers
    ok.

### 2. Speed readings per call

`run.mjs speedCells` reads front and key at each sample's own call boundaries. A reading is shared only with the
adjacent call; the scratch guard resets it.

### 3. No failed activation vanishes

- `steps.mjs notActivated(ctx, scene, apps)` decides from the activate step's own check (`ctx.activated`), whatever the
  scenes command answered:
  - When the check shows the app not front and key, it returns the skipped readings.
  - When the check shows the app front and key but the command answered not ok (Finder front and key with another of its
    windows on top), it returns null, and the caller writes its generic invalid rows as before.
- `run.mjs skippedTarget` writes every planned sample of a frontmost target as skipped: its cases, their timings, the
  scene's speed rows (ops × samples) and its finding rows (`SCENES[scene].targets`, lines, ids). This holds for
  measures-only plans too.
- The same rule now covers:
  - `openPanel` (both regimes), the background pairing's user activation and the launch row;
  - the probe cells (`userField`, `drivenInFront`, the save sheet);
  - the Unicode rows (frontmost rows, `behindUser`, mid-switch).
- `SPEED_OPS` now lives in `run.mjs`, next to its cells; `manifest.mjs` re-exports it.

### 4. The witness's gate

- `probe-plan.mjs keystrokeGate(answer)` reads KeystrokeProbe.swift's two gate answers:
  - first gate: `{error: 'the front window is not the named one; nothing was sent'}` (`KEYSTROKE_GATE_CLOSED`, held word
    for word to the Swift source by a test);
  - between keys: `{…, postedAt, aborted: true, units}`.
- Either answer becomes `outcome.keystroke {posted: false, gate: {at: 'first' | 'during', reason}, finderSelected,
  documentUnchanged}`. The read-back is still taken, the row fails and its interference is judged.
- Invalid is kept for the probe's own faults: no answer, no keyboard layout, an event it could not create.

### 5. #485: an unread order stays unread

- `system-windows.swift`: a nil `CGWindowListCopyWindowInfo` answers `"windows": null`, not `[]`. `swiftc -typecheck`
  passes. The binary cache is keyed by content hash, so devices recompile it.
- `matrix-device.mjs`:
  - `windowOrderOf` keeps a non-list as null.
  - `alerts` baseline and check throw on an unread list. That is fail-closed: an unread list cannot show a screen free
    of alerts.
- `oracle.mjs targetAbove`: an order proves a target stayed below only when it holds the person's window, known by pid
  and number. If that window is known but absent, any target window counts as above it. If no target window is present,
  or the person's window is not known, the result is null, and the row fails.

### Minor: summary

`summary.mjs` keeps `windowOrder` on a failed interference entry. The rendered summary names the reason: "a target window
left above the user window", or "the window order after the action proved nothing".

### Commands and output (this session)

- `node --test test/native-matrix/*.test.mjs test/cursor-sitting/*.test.mjs test/repl-parity/*.test.mjs` →
  `# tests 1462  # pass 1462  # fail 0`. The dot reporter prints nothing else.
- `CUA_NODE=/opt/homebrew/opt/node@26/bin/node node --test test/services-sky*.test.mjs test/services-engine-*.test.mjs
  test/spike-engine-service.test.mjs test/repl-host/trusted-worker.test.mjs` → `# tests 306  # pass 305  # fail 0
  # skipped 1`. The skip is pre-existing: the untrusted-engine Accessibility prompt runs on hosted runners only.
- `CUA_NODE=… node --test test/repl-host/linux-native.test.mjs test/repl-host/linux-reset-release.test.mjs
  test/linux-secrets.test.mjs test/services-engine-linux/*.test.mjs test/approval-across-apps.test.mjs` → `# tests 81
  # pass 77  # fail 0  # skipped 4` (Linux-only).
- `node --test test/native-baseline/*.test.mjs` → `# tests 198  # pass 198`.
- `swiftc -typecheck scripts/native-matrix/system-windows.swift` → passes.
- `swift test` was not run: nothing under `native/engine` changed, so `engineVersion` stays 0.2.0.

### TDD evidence

- **sky:** against the base `sky.mjs` (`git show HEAD:src/services/sky.mjs`, restored after), `node --test
  test/services-sky.test.mjs` gave `# pass 30  # fail 4`. The failures were the two updated `cua/serviceMs` meta tests
  and the two new `cua/errorName` tests. GREEN: `# pass 34  # fail 0`.
- **Speed:** against the base `run.mjs`, the per-call readings test failed (`# fail 1`). GREEN after.
- **The rest** were written beside their code. Each asserts what the old code could not produce:
  - a type-select act that throws;
  - skipped rows carrying the check;
  - a `gate` field;
  - `null` from an unread order;
  - `windowOrder` in the summary's failure detail.
- **One test of mine was wrong.** The oracle test expected `true` for a target above a person's window whose number was
  unread. The rule I settled on is null (proves nothing), so I corrected the test; the row fails either way.
- **New test files and tests:**
  - `test/services-engine-error-names.test.mjs` (3)
  - `services-sky.test.mjs` (2 new, 2 updated)
  - `repl-host/trusted-worker.test.mjs` (1 new, through cua's real supervisor, kernel and worker; it needs Node 24 or
    later, and runs with `CUA_NODE`)
  - `run-records.test.mjs` (the activation-skip test, the per-call speed test, and the witness test widened to both
    gate shapes plus probe faults)
  - `plan.test.mjs` (#354 type-select)
  - `probe-plan.test.mjs` (gate shapes against the Swift source)
  - `oracle.test.mjs`, `matrix-device.test.mjs` (unread order, unread alerts, Swift source check)
  - `summary.test.mjs` (windowOrder detail)

### Decisions

- **The set lives under `src/services/engine/`** because the wrapper must not depend on `scripts/`. `answers.mjs`
  mirrors it, held by a test, and does not import from `src`.
- **The set includes the vendor's ServerErrorCode names**, because the vendor lane's errors carry them and the wrapper
  serves both lanes.
- **Concurrent use keeps its list-typing catch**, which the fix asked only of the method case, and its row has no
  thrown-outcome path to record the answer through.
- **The activation-skip rule is decided by the check, not the command's `ok`.** A command can answer ok while the key is
  elsewhere, or answer not ok while front and key hold (Finder's wrong window).
- **The alert watch fails closed on an unread list.** A paste checked against nothing is not checked. The live paste
  check (`live-device.mjs`) already treated a missing list as empty, and stays as it was.
- **Test harness:** `test/repl-host/supervisor-harness.mjs` `startHost` takes `trustedPaths`, so a fixture service can
  import `src/services/sky.mjs`.

### Concerns

- **Not proven through the vendor's host.** "Rejection and reset through both hosts" is proven on cua's host end to
  end, and on the wrapper by unit tests; it was not run through the vendor's `node_repl` here.
  - Its runtime is not on this Mac. The parity harness (`scripts/repl-parity`) is the place, and adding a registered
    scenario means a new inventory row and expected observations for both hosts.
  - The vendor host already merges trusted response meta per execution: parity scenario `trusted/response-meta`. The
    wrapper's `finally` runs before the rejection is posted.
  - The pilot's vendor lane will show it on its first refused or unconfirmed act. If the controller wants a parity case,
    it is a small follow-up in `test/repl-parity/scenarios/services.mjs` plus the inventory.
- **Finder's type-select now fails on cua until a departure is declared.** This is intended, and the pilot shows the
  pair.

## Fix wave 2

The controller's second review asked for three fixes. All three are done, on top of part 2's commits
(`534fda083..61f121bfa`; the hosted attestation in `run.mjs` is kept as it landed).

### 1. A failed re-activation keeps its method timing (`steps.mjs caseRow`)

When the activate step after a case's prepare did not take, `caseRow` returned the case's skipped row before it pushed
the method's timing, so `textedit/method.click.control` went missing while the case recorded cause `activation`. The
skip path now pushes the timing too: `ok: false`, the case's own skipped readings (`after: null`). The manifest reports
an activation NO VERDICT for it, not a missing row.

### 2. The reads beside a measured call or a row are inside its window (`run.mjs`, `steps.mjs`)

An activation that only a front/key read beside the call saw (an alert's, in an after-read) was unaccounted at run level,
because only the call itself was marked.

- `steps.mjs readKeyAt(ctx)` returns the front/key reading with its device-clock window `at`.
- `run.mjs measured(ctx, key, code, before, readAfter)` runs a speed sample or the finding cell, then its after-read, and
  marks one `measure` window from the before-read's start to the after-read's end. A sample that shares its before-read
  with the previous sample's after-read lies inside both windows; either accounts the activation.
- `caseRow`'s after-read (`late`) goes through the row's `span`, so the row's window runs to its end. The reads before
  the act were already inside it.
- The launch row's window runs from its before-read's start to the end of the read after its check.
- Nothing else widens a window: the harness steps, the scene's setup and the gaps between steps account as before, so
  an unrelated activation is still unaccounted and the run incomplete.

### 3. A proven gate failure survives a failed read-back (`steps.mjs keystrokeWitness`)

When the probe's gate held the keys (at the first gate or between keys) and the witness's read-back cell then failed,
the row became `invalid`: no witness outcome and no oracle entry. Now the gate's proof stands:

- The outcome is `keystroke: {posted: false, gate, finderSelected: null, documentUnchanged: null, readBack: {unavailable:
  true, error}}`, with the error bounded at 160 characters.
- The row finishes `ok: false` and its interference is judged; the front/key rule can still make it NO VERDICT.
- Without a gate, a failed read-back still leaves the row invalid: nothing else proves what the keystroke did.

### Decisions

- **The windows widen only over their own reads.** A measure window or a row window runs from its first front/key read
  to its last, and no further. The alternative was a wider margin or an excuse for any read, which would also have
  excused activations in the harness's own gaps.
- **`finderSelected` and `documentUnchanged` are null when the read-back is unavailable**, not false. Unread is not
  observed-false, matching fix wave 1's rule.
- **Test double (`run-doubles.mjs`):** a cell answer `{cellError}` stands for a cell that threw (envelope `ok: false`).
  A thrown `lane` call is a lost transport, which ends the run; a cell-level failure needed its own shape.
- **`run.test.mjs` "an activation the run cannot place":** the stray activation moved from 1.5 s after click.control's
  check to 0.5 s before the next call. The first spot is now inside the row's window (its after-read), the second is still
  a true gap past the margin.

### Commands and output

- RED: the three new or widened tests were run against `HEAD`'s `steps.mjs` and `run.mjs` (copied in, then restored):
  `node --test --test-name-pattern="measured call or a row saw|Acceptance 3|timing is skipped with it"
  test/native-matrix/run-records.test.mjs` → `# pass 0  # fail 3`.
  - The timing test: `the timing row is there, once` (`0 !== 1`).
  - Acceptance 3: the gated row with a failed read-back was `invalid`, not `[false, undefined]`.
  - The new window test: `["1 activation(s) fell in no step of the run: not accounted for"]` (`false !== true`).
- GREEN: the same tests on the fixed sources → `# pass 3  # fail 0`.
- `node --test test/native-matrix/*.test.mjs test/hosted-sittings/*.test.mjs test/cursor-sitting/*.test.mjs
  test/repl-parity/*.test.mjs` → `# tests 1509  # pass 1509  # fail 0`. The dot reporter prints nothing else.
- `CUA_NODE=/opt/homebrew/opt/node@26/bin/node node --test test/services-sky*.test.mjs test/services-engine-*.test.mjs
  test/spike-engine-service.test.mjs test/repl-host/trusted-worker.test.mjs` → `# tests 306  # pass 305  # fail 0
  # skipped 1` (the pre-existing hosted-only skip).
