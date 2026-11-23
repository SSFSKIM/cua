# T10b′ part 1: what the matrix records (M5 wave 1, refs #506, #485)

Task 6b-1 of `docs/doperpowers/specs/2026-10-18-own-native-engine-m5-wave1.md`: the matrix harness's records, proven
against the run's doubles. No live run, no GUI, no hosted run, no Mac mini; part 2 (hosted plumbing) takes these records
to the runner.

Commits on `feat/117-m5`:

- `6dbb41172` the window-order oracle, a target window left above the person's fails the row (refs #485)
- `9bbd54202` what the matrix records about each judged act (refs #506)
- this report (refs #506)

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
   - The boundary does drop the name; see "Discoveries" for where, and the smallest change proposed.
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
- **Speed and finding readings bracket the series.** The reading before the series is the previous series' after
  reading.
  - Why: one probe launch per series, not per sample. The readings judge the whole series' environment.
- **The witness runs only in `textedit/background/click.element@finder`**, on both lanes, after the click's check.
  - It uses a dedicated prepare cell (007, or 008 when 007 is already selected) so the selection must move.
  - Only an aborted probe fails the witness. Any other probe problem makes the row invalid.
  - The probe's `--text` grammar widened to inner dashes (`^[A-Za-z0-9][A-Za-z0-9-]{0,15}$`) to type a file name.
- **`caseRow` waits out the probe debounce of the scene it drives (`quiet`)**, because the witness's keys are a user's
  to Finder.
- **Window-order targets are the driven app's bundle ids.** The Open panel adds its XPC service; the launch row uses
  the launched app.
  - The person's window is identified by pid and its top-window number from the before-read.
  - With the person's window missing from the order, any target window counts as above it.
  - An order unread after the act fails the row, as an unread front does.
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
- **The smallest change proposed (not made: runtime code, outside this milestone):** in `src/services/sky.mjs`'s darwin
  `handleRpc` (line 212), set `cua/errorName` in the same `finally`.
  - On a throw, the value is the engine's `error.errorName` when `error.name === 'SkyComputerUseError'` and the name is
    a bounded identifier (`/^[A-Za-z][A-Za-z0-9]{0,63}$/`). Otherwise, and on success, it is `null`.
  - Because `sky.mjs` wraps both engines' services, the meta is symmetric on the vendor's lane and cua's, and a
    multi-call cell keeps its last call's value.
  - Do not gate the value on `ADMITTED_ERROR_NAMES`: it lacks several names the judge's REFUSAL/UNCONFIRMED sets use
    (`screenChangedSinceScreenshot`, `appWindowOverPoint`, `windowOnAnotherSpace`, `desktopGateClosed`,
    `valueUnconfirmed`, `pasteUnconfirmed`, `scrollUnconfirmed`, `menuUnconfirmed`).
  - The harness already reads the key, so no harness change follows.
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
- `cua/errorName` is still absent on both lanes until the proposed `sky.mjs` change lands, so rows keep `Error` for
  now. The change belongs to whoever owns `src/services`.

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
- **The `sky.mjs` `cua/errorName` change** (above) if the judge's answers are to see the engine's own names on hosted
  runs.
