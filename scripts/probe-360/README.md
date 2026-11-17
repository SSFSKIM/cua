# #360: background Firefox caret delivery, measure first

Disposable kit based on `probe/354-measure` at `4ab1ebd6`. Nothing here is a proposed product fix.
The engine is pinned to current main at preparation, `b99232def1e37307848dd1ccb08726729eb81b66`, not a moving ref.
The earlier #354 reproduction base was `3c669314`; this kit measures the code a fix would land on.
Only a runner-owned scratch copy is patched. The vendor runtime is untouched.

## Dispatch

The workflow is registered as **420915277**. Its push trigger is restricted to `probe/360-measure` and
this kit/workflow's paths; every eligible push runs **smoke only**. Full measurement is available only by
explicit dispatch. No inherited workflow is changed. Initial preparation stayed local while Actions was
billing-locked; hosted execution began with [smoke 44018349366](https://github.com/SSFSKIM/cua/actions/runs/44018349366).

```sh
# Smoke: 128 attempts, one repetition per labelled cell.
gh workflow run 420915277 -R SSFSKIM/cua --ref probe/360-measure -f smoke=true
# Full: 2,560 attempts, 20 repetitions per labelled cell.
gh workflow run 420915277 -R SSFSKIM/cua --ref probe/360-measure -f smoke=false
```

The only push trigger is this branch plus the kit's own paths; push always defaults to smoke.
There are no PR, schedule or workflow-call triggers. One hosted macOS job,
approximately an hour for full measurement plus installation/build margin.
The first smoke's measured cell times project the full plan to 63 minutes; the controller therefore has a
75-minute measurement budget and the job a 90-minute timeout. The plan is not reduced to fit the old 60-minute cap.
A budget expiry retains partial evidence and fails coverage; it never trims the planned denominator.
The Mac mini and the owner's GUI/profile are not used.

## Cells and denominators

Four ordinary public fixtures: textarea, input, contenteditable (`span` content), and compose
(nested `div`, textbox role). All use `Old draft sentence goes here.` (29 ASCII characters).
Each row first waits up to 3 seconds for the foreground browser's registered fixture title and live command
poll (the #354 binder's bound); it records each identity read in `fixtureBindingAttempts`. A transient null AX
title is not treated as a different realm or a hidden-owner fallback. If the bound expires, the row remains an
explicit setup failure with no key posted. The row then sets up the visible owned document in the foreground
without an engine click, brings the cover forward, settles 250 ms, verifies the intended selection, then measures
**one key only**.
No typing, screenshot, activation, raise, repair, or automatic key retry occurs in the measurement interval.
Foreground-reference rows deliberately keep Firefox in front; they are not background successes.

| Cohort | Labelled cells | Full attempts |
| --- | ---: | ---: |
| Left / Option+Left × 4 editors × 10 variants | 80 | 1,600 |
| Cmd+Left / Cmd+Shift+Left × 4 editors × baseline and equivalent prelude | 16 | 320 |
| Foreground baseline references, all 4 keys × 4 editors | 16 | 320 |
| Background baseline, no AX range reader or event tracing, Left / Option+Left × 4 editors | 8 | 160 |
| Background baseline at offset zero, Left / Option+Left × 4 editors | 8 | 160 |
| **Total** | **128** | **2,560** |

Smoke uses the identical plan at one repetition per cell, not a shortened subset. Order rotates each repetition.
There are no replacement trials: attempted, scorable, invalid, errors, exact effects, safe effects, and missing rows
remain distinct. The reader rejects duplicate, unknown, mode-mixed and missing IDs. Native effect failures do
not invalidate a trial; fixture/identity/watch failures do. A key-induced editor focus loss is a scored failure,
not a setup exclusion. Three consecutive setup failures stop the run.

### Variants

1. `baseline`: original EventPoster event creation and keyPresses; force plain route 2′ without a focus hold.
   This is Firefox's failing route, **not** a claim that production routes every Command chord by 2′.
2. `window`: request window fields 51, 91 and 92 on the original events. Record what survives and the
   resulting NSEvent window number. Offline on this Mac, 51 survives and 91/92 do not on keyboard events.
3. `nsevent-window`: create down/up with AppKit's keyboard event initializer, the target window, U+F702
   arrow characters and unchanged requested modifiers. This is a compound construction/source comparison,
   not a one-field intervention. Record actual fields rather than assuming the same source.
4. `numpad`: add numeric-pad only to down/up.
5. `function`: add secondary-Fn only to down/up.
6. `arrow-flags`: add both. Restore and flags-changed events retain the original semantics.
7. `private-source`: original builder, private source requested.
8. `combined-source`: original builder, combined-session source requested.
9. `equivalent-prelude`: route 3's core synthetic subtype-1 + window-stamped inert outside click, the
   **unchanged key** (no Command modifier invented), then subtype-2. No focus-hold registry, screen hold,
   NSRunningApplication activation, AXRaise, or production foreground/order repairs. It is action-scoped,
   not a test of the full held production route. Every prelude event is logged and side effects are priced.
   As in production, the prelude and its inert click go to the app pid and the key to `keyboardTarget`; the
   two are not assumed equal, and each event's actual `postToPid` is recorded.
10. `ax-range`: direct AXSelectedTextRange write to the independently specified fixture destination.
    No key event is posted. This prices an AX alternative, **not** a generic word-motion implementation:
    a production Option+Left replacement would need native word-boundary semantics and readable same-field range.

The reader-free baseline uses the original fast poster, skipping engine window probes/per-event serialization
as well as the side range reader. It detects aggregate instrumentation observer effects, not AX-only causality.
The owned-document title checks and passive foreground/order watcher remain in both arms.

## Evidence and readers

Download the `probe-360-smoke` or `probe-360-full` artifact, then run offline, with no GUI or engine:

```sh
node scripts/probe-360/read.mjs /absolute/path/to/artifact/data
```

- `plan.json`, `config.json`, `progress.json`, `engine-stopped.json`: expected IDs, pins, versions, image,
  mode, timing budget, progress, and verified engine termination. Firefox is installed from the hosted image
  or Homebrew, so its **recorded version**, not an assumed historical version, bounds the result.
- `rows.jsonl`: one attempted row, owned DOM setup and samples at requested 0/50/250/1000 ms after RPC return,
  actual timestamps, key answer, native fields, before/after window identity, retained-field AX ranges, and
  20 ms passive foreground/order samples, each with `mainLoopAgeMs`. No AXValue/selected-text reads or secret fixtures are used.
- `rates.tsv`: per-cell planned/attempted/scorable/exact/safe effects, errors, false plain successes,
  side effects/unknown side-effect coverage, editor focus loss, AX readability/agreement/false confirmations.
- `events.tsv`: all posted types, flags, keycodes, fields 51/91/92, NSEvent window number, target-pid field,
  **postToPid argument separately**, source pid and actual source-state field. Rows retain before/after-post
  fields. Private sources report generated state IDs; `-1` is the constructor selector, not the actual ID.
- `dom.tsv`: per-attempt keydown/up, beforeinput, input and selectionchange traces, including selection,
  key modifiers and the public seed. The absence of beforeinput alone does not imply failed caret movement.
- `ax.tsv`: the detection counterfactual. Availability is not accuracy: compare pre/post ranges against DOM,
  require the same focused AX element and a genuine non-boundary transition; count false confirmations.
  At offset zero, unchanged state never acknowledges consumption. DOM and AX samples are asynchronous,
  with timestamps retained; they are not an atomic receipt fence. No claim extends to secure fields.
- `engine-stderr.jsonl`: per-event diagnostic records (including posts before an RPC error).
  `gecko.log*`: stock Firefox `NativeKeyBindings`, `KeyboardHandler` and `IMEHandler` logs with timestamps.
  Search for `HandleKeyDownEvent`, `GetEditCommands`, `DoCommandBySelector`, `moveLeft` and focus/IME messages,
  aligned to the attempt's key timestamps. Logs can be absent in a release build; absence is not proof.
- `patch.json`, `engine-head.txt`, `event-check.txt`, installer provenance: source hashes, engine pin,
  offline event-construction checks and browser/image origin. Browser profiles/caches are not uploaded.

An exact effect means the known seed is unchanged and the DOM range equals the intended destination after 1 s.
A safe effect additionally requires readable foreground/order samples without a violation or editor focus loss.
The watcher stops the run on any observed foreground/order violation; it never repairs it. Its 20 ms interval is
requested, not guaranteed: first-smoke actual gaps were p50 38.8 ms, p95 89.4 ms, maximum 293.6 ms. Use each run's
recorded timestamps to price its actual resolution. A brief activation/raise between samples can be missed, so
0 observed in 20 is not proof of zero risk. No variant is a general delivery guarantee.

The foreground sample is NSWorkspace's cached frontmost app. Apple documents that such state persists until the next
main run-loop turn in a common mode, so the side helper keeps its main thread turning that loop for its whole life and
runs requests (AX reads included) on another thread; the main thread never waits on stdin. Each sample records
`mainLoopAgeMs`, the time since the loop's last 5 ms heartbeat. A sample older than 250 ms (`MAIN_LOOP_STALE_MS`), or
without the field, leaves that row's side-effect coverage unknown and so never counts as a safe effect. That
detects a frozen cache, not lag: the delay between a real foreground change and the cache catching up is not measured,
and is a second reason (with the 20 ms interval) a brief flash can be missed.

## What the run can decide

- Was the key received in the owned editor at all (DOM keydown), with which native fields, and did the caret move?
- Does changing a window field, arrow flag or source fix exactly the failing contexts without breaking input/textarea?
- Does the synthetic key-equivalent prelude change Gecko's command/IME path without foreground/order side effects?
- Can AX range writes substitute for this fixture movement, and can the range reader honestly detect failure?
- Does adding the reader/tracing itself change the outcome? Do boundary predicates falsely look like receipts?

If only DOM keydown arrives but the selector/default action is missing, native editor/keybinding focus is implicated.
If window-only or flag-only repairs work, the field intervention supplies stronger causal evidence. If none works,
report the tested limit; stock logs and these external interventions may narrow a native mechanism without proving
its exact internal branch. Do not turn all-negative cells into a claim that every possible background path is impossible.

**Expectations, not measured outcomes:** the best guess is a native keybinding/IME/key-window dependency:
plain arrows and Command chords take different focus-establishing paths. A wrong target pid is not yet ruled out:
`keyboardTarget` chooses the focused AX element's owner, and the kit must establish whether failing and working
editors actually resolve to the same pid. The original builder has no window stamp and overwrites any generated
arrow flags with modifier-only flags, so those are credible competing causes. Expect AX range to be available but sometimes stale (the #354 input/textarea
controls reported the old caret after successful DOM motion), making readability alone unsafe. An AX write may
work, but cannot be promoted to a generic Option+Left replacement from this ASCII fixture.

Code readers: `Keyboard.swift` (keyPressEvents/EventPoster), `Input.swift` (pressKey/keyboardTarget),
`Routes.swift` (pressKeyRoute/isKeyEquivalent), `FocusHold.swift` (holdKeyFocus), `Activation.swift`
(FakeActivation's subtype/inert-click core and the repairs deliberately excluded here).

Upstream research, not a substitute for the measured Firefox version:
- [Gecko NativeKeyBindings](https://raw.githubusercontent.com/mozilla-firefox/firefox/main/widget/cocoa/NativeKeyBindings.mm):
  moveLeft/moveWordLeft selectors map to caret commands. Single-line bindings differ from the shared multiline/rich-text
  bindings; that table alone does not explain the textarea/contenteditable split.
- [Gecko TextInputHandler](https://raw.githubusercontent.com/mozilla-firefox/firefox/main/widget/cocoa/TextInputHandler.mm):
  HandleKeyDownEvent calls interpretKeyEvents; IMEInputHandler::IsFocused requires first responder, key window, active app.
  That check's existence does not prove it gates this failing path; logs/interventions must establish the connection.

Offline checks: `node --test scripts/probe-360/*.test.mjs scripts/probe-354/transport.test.mjs`
(`side.test.mjs` compiles the helper's `serve` region with `swiftc` and shows its main run loop keeps turning while
stdin is idle, against a negative control of the old blocking shape; it skips without `swiftc`);
`swiftc -typecheck scripts/probe-360/side.swift`; a scratch build and focused `Probe360EventChecks` test
construct events without posting or making AX requests. They cannot validate GUI delivery, live effect rates, or that
the hosted runner's NSWorkspace cache refreshes as the documentation says; the first hosted run's `mainLoopAgeMs`
and `frontmostPid` samples are the evidence for that.
