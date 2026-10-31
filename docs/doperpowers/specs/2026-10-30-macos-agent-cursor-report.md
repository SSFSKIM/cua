# Execution record: a visible agent cursor on macOS (#235)

Spec: [2026-10-30-macos-agent-cursor-design.md](2026-10-30-macos-agent-cursor-design.md). Executed by cursor235#b93055dd through doperpowers:subagent-driven-execution.

## M1

### Step 1: the spike (from the executor's report)


Method. A throwaway Swift program (`/Users/new/.claude/jobs/b93055dd/tmp/spike/spike.swift`, built with
`swiftc -O`, outside the tree), run on the MacBook (macOS 26, built-in Liquid Retina XDR at 1512 × 982 pt,
ProMotion: the small window's display link counted 1302 frames in about 10.9 s, about 120 Hz):
- An accessory-policy process shows two non-activating panels: a 760 × 320 pt "pattern" window of its own (40 pt
  colour stripes and a black band, for the blur to act on) and, above it, a display-wide transparent `NSPanel`
  (`.nonactivatingPanel`, `ignoresMouseEvents`, clear, the spec's collection behaviour). Both sit at the floating
  level only for the spike, so the owner's windows could not come between them during captures.
- Rigs in the display-wide panel, each an 84 pt container view with a halo and a magenta arrow (a sibling view above
  the halo), moved only by a `CAKeyframeAnimation` of the container layer's `position` (paced, autoreversing,
  endless, `preferredFrameRateRange` 60–120), committed once:
  - candidate 1, `NSVisualEffectView` (`.behindWindow`, `.active`) with `maskImage` a soft circle (12 pt feather), in
    `.hudWindow` and `.underWindowBackground`;
  - candidate 2, a `CALayer` with `backgroundFilters = [CIGaussianBlur radius 17]` and a soft-circle mask, in a view
    with `layerUsesCoreImageFilters`;
  - for the latency comparison only, the vendor's way (fallback b): an 84 pt window holding the candidate 1 rig,
    moved by `setFrameOrigin` from a `CADisplayLink` on the main thread every frame.
- Following: screenshots of the pattern window's rectangle (`screencapture -R`) at rest and mid-glide, and a 1 s
  screen video (`screencapture -v`, recorded at 60 fps, 66 frames) analysed frame by frame: the arrow's centroid
  (magenta pixels) against the halo's centre (the run of pixels that differ from the bare pattern on a row through
  the halo).
- Main-thread latency: a background thread posts `DispatchQueue.main.sync {}` no-op blocks (standing in for
  `Keyboard.swift`'s key posts), 200 µs apart, 300 per block, in four configurations: off (the display-wide panel
  ordered in, nothing animating), A (candidate 1 gliding), B (candidate 2 gliding), and the small window moved by a
  display link; 12 rounds alternating the order, 3600 samples per configuration, 150 ms settling after each switch;
  two sittings. Bootstrap (2000 resamples) of the difference of medians. Process CPU per block from `getrusage`.

Candidate 1, `NSVisualEffectView` behind-window: **blurs, and the blur follows.**
- It is a real backdrop blur of the content below the panel (the stripes behind smear into gradients), with the
  soft mask edge honoured (a gradient over about 24 px = 12 pt).
- Mid-glide it stays centred on its arrow. In the video the arrow moves 23 px (11.7 pt) per recorded frame (about
  700 pt/s); the arrow-to-halo offset averages 6.10 px moving left (n 40, sd 2.75) and 6.61 px moving right (n 17,
  sd 2.53). A lag would flip sign with the direction; the 0.5 px difference is within noise and far under one
  frame, so the halo is composited in the same frame as the arrow. The constant 6 px is the arrow's centroid offset
  in my rig.
- The recorder caps at 60 fps, so 120 Hz for the animation itself is not directly measured; the animation runs in
  the render server with a 120 Hz preferred rate, on a 120 Hz display.
- Look: in the current dark appearance the materials darken the backdrop. With the effect view's appearance set to
  `.aqua`, `.hudWindow` and `.fullScreenUI` give a light frosted halo that keeps the colours behind it, which is the
  Design's "blurs and lightens"; `.popover`, `.menu` and `.toolTip` are near-opaque grey-white. The blur radius and
  saturation are the material's, not settable (the vendor's Fog uses radius 17).

Candidate 2, `CALayer.backgroundFilters`: **no blur.** Only the layer's own faint fill shows; the filter sees the
window's own (transparent) content, not the windows below. Rejected.

Main thread, two sittings (µs per `main.sync` round trip):

| configuration | median | p90 | p99 | process CPU (ms/s) | median diff vs off [95 % CI] |
|---|---|---|---|---|---|
| off (sitting 1 / 2) | 11.8 / 11.5 | 17.0 / 15.8 | 48.8 / 29.1 | 72.6 / 66.4 | – |
| A, candidate 1 gliding | 11.9 / 11.8 | 17.9 / 16.1 | 55.7 / 32.5 | 74.8 / 68.1 | +0.1 [+0.0, +0.3] / +0.3 [+0.1, +0.5] |
| B, candidate 2 gliding | 11.8 / 11.8 | 16.8 / 16.2 | 38.8 / 31.6 | 78.6 / 75.7 | −0.0 [−0.2, +0.1] / +0.4 [+0.2, +0.5] |
| small window, display link (fallback b) | 15.0 / 14.5 | 27.0 / 22.0 | 331.8 / 313.8 | 174.2 / 159.3 | +3.2 [+3.0, +3.5] / +3.0 [+2.8, +3.2] |

- A gliding Core Animation cursor adds 0.1–0.3 µs to a round trip of about 11.5 µs. It is the same with B, which
  animates without blurring, so it comes from an animation running at all, not from the blur. In the second sitting
  the interval excludes 0 by 0.1 µs, so read strictly the "interval includes 0" half of Acceptance 12's rule misses
  there; its upper end (0.5 µs) is three orders of magnitude under the rule's 1 ms floor, and 200 keys would add
  about 60 µs in all. The process's CPU rises by 1.7–2.2 ms/s: no per-frame work in the process.
- The display-link window adds 3 µs at the median, multiplies p99 by 7–11 (to 314–332 µs), and costs about
  95 ms/s of process CPU. It is the fallback to avoid, as the spec expected.
- WindowServer's own CPU for each configuration could not be told apart: its baseline on the owner's busy screen
  varied 1.08–1.66 s per 3.3 s, more than any difference.

**Verdict: promote the Rendering design as written**, with candidate 1, `NSVisualEffectView` (`.behindWindow`,
`.active`, `maskImage` a soft circle, appearance `.aqua`, material `.hudWindow` or `.fullScreenUI`, to be chosen by
look in the build) as the halo inside the display-wide panel, moved only by Core Animation. Neither fallback is
needed.


### The build (from the executor's report)

#### Commits

- `a5e37a47` the cursor's motion module, the vendor's numbers against the reference vectors
- `73081571` the cursor's palette and its state table
- `a4b938c0` the cursor hub and its attachment
- `7609069b` the cursor's panel, halo and probe; the engine's hooks
- `be05d750` a display reconfiguration re-sets the panels; the arrow's fill; #117's superseding entry

#### What was built

New files in `native/engine/Sources/Engine/Cursor/`, one responsibility each:
- `CursorMotion.swift`, pure. It holds `MotionConfiguration.live` (30 fields), `CursorState`, `Trajectory` (with
  `state(at:)` for splices), `Mode`, and `plan(from:to:bounds:reduceMotion:configuration:)`. Inside: the candidates,
  measure, score and select, the response, the velocity-Verlet `SpringSimulation` with the resolved settle rule, the
  heading with its terminal blend, the scoot's springs, and the halo swell (the SwiftUI follow spring on the style
  velocity). There is also `planStraight` (the drag trace) and `snapTrajectory`. Each translation cites its vendor
  function.
- `CursorPalette.swift`: the eight hues, the pill shade (darkened in 1 % steps only as far as 4.5:1 needs),
  `CursorIdentity`, the 24-character label cut, and M1's placeholder identity per connection ("Agent N").
- `CursorLifecycle.swift`: the state table as a pure machine over an explicit clock.
- `CursorAttachment.swift`, pure: the on-screen window list, the attachment (window, owner, level 0/102, visible), the
  occlusion skip check, and the screens' coordinate flip.
- `CursorHub.swift`. Its interface, all non-blocking: `begin`, `end`, `act`, `afterElementAction`, `configure`,
  `hide`, `closed`, `userActed(pid:)`, `drain`, `tick`. A serial cursor queue holds all state. Generations are bumped
  under a lock by act, hide and close, and checked twice: on the queue after planning, and on main before applying.
  Every commit carries the whole desired state, so dropping a stale one is safe. One timer serves the transitions and
  the 4 Hz window check. Observers cover activation, deactivation, Space, the lock (distributed), Reduce Motion and
  display changes. An `NSProcessInfo` activity is held while a cursor shows.
- `CursorPanel.swift`, the main-thread renderer:
  - The panel is non-activating, can never become key or main, ignores the mouse, uses
    `.canJoinAllSpaces/.fullScreenAuxiliary/.ignoresCycle/.transient`, has `sharingType = .readOnly` and
    `hidesOnDeactivate = false`, and spans the screen's full frame.
  - It is ordered above the target at the target's level (`orderFrontRegardless` at 102).
  - Keyframes drive the position, the heading and stretch, and the halo swell. Each press dip starts at its own host
    time; under Reduce Motion it is an opacity dip.
  - The fade (0.44 s) carries a blur on the arrow layers. The rock runs ±10°: a ramp, then an endless swing, and a
    0.41 s stop. Taken over is opacity 0.5.
  - The pill sits beside the tip and flips to stay on screen.
  - Increase Contrast gives an opaque fill and a 100 % stroke.
  - Nothing animates while hidden.
- `CursorHalo.swift` owns the backdrop alone, as the design session asked. It is an `NSVisualEffectView`
  (`.behindWindow`, `.active`, `.hudWindow`, forced `.aqua`), 66 pt with a soft mask (solid to r 9, smooth to clear at
  r 33), plus a 14 % wash of the session's colour (24 % with Increase Contrast).
- `CursorSystem.swift`: the live environment. The screens and Reduce Motion / Increase Contrast are cached from main
  under a lock, and its observers are registered before the hub's. It also provides the AX frame and window reads and
  the activity.
- `CursorProbe.swift`: `--probe cursor [--backdrop]` runs the scripted moves and states, printing one line per step
  with planned and measured ms. `--probe cursor --window <n> [--seconds n]` holds a cursor still over a given window
  for M3.

Hooks and touches outside `Cursor/`:
- `Methods.swift`: `begin`/`end` after the lock and app resolution, with `end` in a defer. Keyboard-only means
  press_key, type_text and paste. `Engine` gains `cursor` (its default is inert: state only, no drawing) and wires
  `intervention.ledger.onRecord` to `userActed`.
- `Input.swift`: `deliverPointer` and `deliverClick` gain `announce` (defaulted). It runs after `beforePosting` and
  event creation, just before posting. The coordinate click and the synthesized element click (`ElementInput.swift`,
  which now takes `connection:`) pass `.click`. The route-1 element click calls `act(.click(pointing.point))` after the
  in-flight check, before `deliverAction`.
- `ScrollDrag.swift`: `.scroll(target.point)` just before the post, and `.drag([start, end])` through `announce`.
- `SecondaryAction.swift` and `TextSelection.swift`: `afterElementAction` runs the AX operation first and acts only on
  success. `ValueSetting.swift` acts `.element` after `setElementValue` returns, since it throws on failure.
- `Intervention.swift`: `InterventionLedger.onRecord` is called outside the ledger lock after a recorded event.
- `Server.swift`: the live hub is made on main; `closed` runs on unregister and for every connection in `stopAndExit`
  (then `drain`).
- `Screenshot.swift`: the shareable-content cache key subtracts `EngineWindows.shared.all`, the cursor panels'
  numbers.
- `Probe.swift`: the dispatch and usage.
- `docs/doperpowers/specs/2026-10-18-own-native-engine-design.md`: a dated Decision Log entry superseding "no cursor
  overlay" for the cursor only.

#### Tests

`swift test --package-path native/engine --scratch-path "$TMPDIR/cua-engine-235"`: **552 tests, 0 failures**, output
pristine (no warnings, no stray lines). The release build is clean. The Cursor-filtered suite has 61 tests, plus the
route-hook test in RouteTests:
- `CursorMotionReferenceTests` (6), Acceptance 11's unit part, against `vectors.json`: mode; chosen candidate; every
  candidate's cost (relative error < 1e-9) and in-bounds flag; the chosen geometry (1e-9); response < 1e-9; settle step
  within 1 of the reference.
- `CursorMotionTests` (10): the end at rest; arrival before settle within 3.157 pt; the heading formula; the scoot's
  stretch, squash and tilt ending at rest; swell on paths only (≤ 2.5); Reduce Motion as a straight 0.15 s ease-out
  with no flourish; the drag's straight trace; interpolation and clamping; a splice continuing with velocity; the
  settle rule itself, force included.
- `CursorPaletteTests` (6): the hues and their order; every pill ≥ 4.5:1; passing hues kept; clay and amber darkened
  minimally; WCAG ratios; the placeholder; the label cut.
- `CursorLifecycleTests` (10): hidden → acting → thinking → fading → hidden; thinking → taken over → acting on the next
  request; taken over fading after 5 s; any state → acting on an action; no fade while a request is in flight (19 s of
  typing); a keyboard begin after a fade returning at the last point in that app, or staying hidden where there is
  none; a keyboard begin clearing taken over; a non-keyboard begin cancelling a fade but never reviving a hidden
  cursor; hide; the person acting while hidden.
- `CursorAttachmentTests` (7): the target's level; 102 when the app is in front or has its own menu open (another
  app's menu does not count); hidden off-screen; the flip across two screens and in the menu-bar row; the nearest edge
  point; occlusion ignoring the engine's panels.
- `CursorHubTests` (21):
  - the fade-in and dip at the first target; the dip at arrival, not at the call; scroll with no dip; drag (dip at the
    start, then the trace);
  - rapid retargets splicing from the retained trajectory (no backward jump) at a 20 ms lead;
  - a hide or a close during planning dropping the plan (the close ordering the panel out); a stale commit dropped at
    the main thread;
  - no point, no window or off-screen moving nothing; the stored-frame fallback;
  - **the AX-only hook reading the frame only after a 100 ms operation returns**, and a failed operation pointing
    nowhere;
  - the level drop on a synthetic `didDeactivate`; hide and show on synthetic `activeSpaceDidChange`; the 4 Hz check
    seeing a menu open and close; a synthetic lock notification; `userActed` by pid;
  - the idle fade on the hub's timer and the activity released; Reduce Motion; a keyboard reappearance; a display
    reconfiguration re-setting the panel.
- `RouteTests.testTheCursorIsToldAfterTheGuardAndBeforeTheClicksEventsAndNeverForARefusedClick`: `announce` runs
  before the click's events, never for a guard refusal, never for an in-flight stop.

#### TDD evidence

- RED, motion: `swift build --build-tests …` failed with `error: cannot find 'plan' in scope` and `cannot find
  'CursorState' in scope` (CursorMotionTests.swift:65). That was expected, as the module did not exist. GREEN: 16/16
  on the first run after implementing.
- RED, palette: `error: cannot find 'cursorPalette' in scope`. GREEN: 6/6.
- RED, pointer hook: `RouteTests.swift:484: error: extra argument 'announce' in call`. GREEN: the full suite of 551,
  as it then stood.
- Lifecycle, attachment and hub: their tests were written first, but I ran them only after implementing. They passed
  on their first run except one hub test whose clock step jumped over the whole fade, which I fixed in the test. I am
  stating that rather than claiming a RED I did not run.

#### Live checks on the MacBook (seconds long, draw only)

- `"$TMPDIR/cua-engine-235/release/cua-engine" --probe cursor` exited 0 with 11 step lines. Planned / measured ms:
  appear 0 / 259, scoot 279 / 536, path 1300 / 1562, edge 1321 / 1574, backward 1317 / 1573, down-right 1658 / 1914,
  drag 1971 / 2380, scroll 279 / 535, thinking 1502, taken over 1005 (phase takenOver), fade 540 (phase hidden).
  Planned durations include the halo's swell relaxing after the tip settles.
- `--probe cursor --backdrop`, recorded with `screencapture -v` over the probe's own opaque backdrop. In the frames:
  - the frosted halo blurs and lightens the bands, with the session's tint;
  - the arrow and pill ("Agent 1") are crisp; the arrow rocks while thinking;
  - the halo swells on long paths; taken over is visibly at half opacity; the fade leaves nothing.


### Task review

Reviewer: doperpowers:task-reviewer. Round 1 (290f12bf..be05d750): five Important (an explicit hide installed an already-finished fade; a superseded click could dip at a later scroll; taken over kept a glide moving; live Reduce Motion changes did not reach an installed motion or restart the rock; the activity option held off idle sleep) and two Minor (the fill ratio, per the design session; the reduced-motion dip's duration), all fixed in 3827cbda. Round 2: one Important regression (a replanned motion kept the old settle deadline) and one Minor (taken over left a playing dip and the halo's relaxation), fixed in 8d1f156f. Round 3: clean. 564 engine tests, 0 failures.

## M2

Built 88ec92ef..0196629b by one task executor (decisions in the spec's Decision Log, "M2 build"): the engine's `cursor` request and `engine.json`'s `cursor` key; each session's identity resolved on the trusted side (MAWS's variables, then `sminos who --session <id>`, bounded at 500 ms and cached, then the project folder) with a hash colour; `end_task`'s hide; the remote `cua/cursor` initialize key; the `cursor:` line in `cua engine status` and doctor; the harness's desktop checks skipping the engine's windows. Engine tests 577/577; full `npm test` 4260 pass with one environment failure (`serve-lazy.test.mjs` under an inherited `CUA_FEEDBACK_DIR`, a logged friction), the file passing 29/29 without it.

### Task review

Round 1: two Important. A failed sminos lookup shared by concurrent callers rejected every caller after the first instead of falling back; the optional `cursor` RPC's timeout closed the whole engine connection, failing an execute in flight (both reproduced by the reviewer). The controller added a third item: the matrix oracle's front-window reading skips the engine's windows too (Decision Log). Fixed in cb39e42e. Round 2: the new concurrent-lookup test reached the real sminos lookup and failed on a clean HOME; fixed in 41958220. Round 3: clean.

## Whole-branch review (before the sitting)

`doperpowers:reviewer-high` on fc15e1b8..b767314a (M1 and M2), lens: the cursor never delays, fails or reorders an action, nor adds main-thread work on the typing path. Verdict incorrect, three P2s, each reproduced headless: an unanswered cursor hide delayed the next action by the cursor timeout (303 ms at a 300 ms bound); every unchanged keyboard request sent a render commit to the main thread (100 extra commits for 100 requests); a lost-update race on a connection's generation could drop its first action's cursor. One fixer, f65701fb and d6fc600f (578 engine tests; 53/53 client and service tests). Re-review: correct, no material findings (the delay 303 ms → 1 ms, zero extra commits).

## M3, the unattended part

Docs, the plugin bump (0.19.0 → 0.20.0, the version only, in its own commit 36e9e6cf so a renumber at rebase touches one commit) and the sitting's kit (`scripts/cursor-sitting.mjs` and `scripts/cursor-sitting/`, the runbook `docs/evidence/2026-10-30-macos-agent-cursor/README.md`), d4915811..4457d6d0. Task review round 1 found six Important and one Minor: the drivers trusted the scene record and could act in another document of the same app; the restore did not verify the saved `engine.json` before replacing the engine; the timing verdict let a lower median pass with an undetermined interval; typing samples followed a snap, not a glide; Acceptance 5 had no key-window or focused-element proof; the model-facing sentence was unscoped, and the vendor engine paces and captures the other way; items 9 and 11 could start with System Settings covering TextEdit. Fixed d541bd81..813bce53. Round 2: the focus proof accepted two failed readings; fixed 4457d6d0. Round 3: clean. Kit tests 45/45, full `npm test` 4436/0 under a fresh HOME; hosted test, engine-swift, plugin and sandbox-live GREEN on 813bce53 (run 41156191015). The same median shortcut exists in #171's `scripts/linux-engine-diff/`; routed to #171 by the design session.

Prepared unattended: deps, the harness's Chrome for Testing and Electron fixture, the target guard's window probe, item 8's scratch kit (its runtime installed and the device enrolled on a loopback relay, port 7835); every item's dry run passes.

## M3, the first attended sitting (2026-10-30)

The owner sat at the MacBook from 2026-10-30 19:35 to 23:07 PDT (2026-10-31 02:35–06:07Z; every time below is UTC).
The records are in `docs/evidence/2026-10-30-macos-agent-cursor/sitting/`: `verdicts.jsonl` (the owner's verdicts, with
their words in the notes), `item-*.jsonl` (each run's steps), `timing.md`, and the probes' captures. The runbook is that
directory's `README.md`.

### What ran, and on which build

Three engine builds served the sitting. The ids are `engineBuild()` over each commit's tree, and the engine's own
`started pid … build` lines in the unified log give the times.

| build | tree | served | items |
|---|---|---|---|
| `2f9b3bf06ca4` | d6fc600f, the reviewed branch head | until 04:56:51Z | 1, 2, 3, 4 (attempts 1–5), 10, 8 (all three attempts), #200's vendor A/B |
| `9959a76c544a` | 5369088c (37d1e953: a recorded menu-bar click moves the cursor; 5369088c: the level follows the activation notification's own app) | 04:56:52–05:27:31Z | 4 (attempt 6 and the front-menu probe's two runs), 6 (the slow reruns) |
| `bf2b83cf49ae` | 133156cc (plus cc207f11 and fd5e63c4: the cursor's geometry read off the request thread and the cursor queue, and a state event dropping a geometry read still under way) | from 05:27:35Z | 6 (probes 6b–6d), 5, 7, 9, 11, 13, 12 |

The owner made two QuickTime recordings, both outside the repository (`~/Pictures/Screenshots/`):
- 02:35:44–03:17:07Z, SHA-256 `70870ff3…e5c1803`. It covers the build, the approval and the first item-1 attempt's setup.
  No item's cells ran inside it: item 1's clicks ran at 03:19 and 03:38Z.
- 03:58:44–03:59:18Z, SHA-256 `d3864cee…4c23dc08`. It covers item 4's fourth attempt: the owner placing the windows, and
  the three route-3 clicks of the covered case. It holds no front-menu try (below).

Nothing records 03:59:18Z to the end. These checks are carried by the logs and captures alone: item 4's first front-menu
try with an owner-opened menu (04:04:47–04:04:56Z), item 8's run 2 (04:21:29Z), and the vanish in the front-menu probe's
run 1 (05:06:01–05:06:11Z).

### The verdicts

Each item's last verdict per watch, with the owner's words where the note carries them:

- **1, it shows where the agent acts:** PASS. `first-target`: "owner, second run (first run not seen)". `second-target`:
  "glide to the checkbox and dip seen", then "glide and dip seen". The click-before-arrival clause is the owner's
  observation only (below).
- **2, identity:** PASS. `two-cursors`: "cursor235 and cua_repl pills, two colours". `maws-label`: "Research in blue".
- **3, states and timing:** PASS on all six watches (`thinking`, `fade`, `fade-in`, `taken-over`, `taken-over-cleared`,
  `end-task`).
- **4, covered and front:**
  - `covered`: PASS, from the run with scrolls ("clicks raised TextEdit by route 3": #200's raise, outside this initiative).
  - `front-menu`: FAIL on `2f9b3bf06ca4` ("cursor did not show with TextEdit frontmost and the owner-opened Format
    menu"), then PASS on `9959a76c544a`: "front-menu probe run 2: the cursor stayed above the open Format menu; run 1 it
    vanished at the owner's menu click (not reproduced); not half-transparent: a menu-bar click isn't attributed to
    TextEdit's pid".
  - `background-menu` and `menu-closed`: not run. No engine opens a menu for an agent, and the design session reworded
    Acceptance 4.
- **5, never in the way:** PASS on `taken-over` and `screenshot`. Taken over: "click on the arrow's tip reached the
  button … cursor half-transparent; next action refused 'still interacting' … 0 engine activations". Screenshot: "the
  agent's screenshot item-5-step-24-0.jpg has no cursor pixels". **The focus proof is unmet** (below). The QuickTime
  clause has no verdict.
- **6, attached between actions:** PASS on all eight watches. The first `space-away` failed ("cursor disappeared at the
  Space click; not clearly observed; rerun") and passed on the slow rerun. `space-back`, `lock`, `after-lock`,
  `menu-bar-row` and `full-screen` passed on `bf2b83cf49ae`, with region captures beside the owner's word.
- **7, typing keeps it alive:** PASS on all four watches, the owner's word backed by the `probe7` capture timeline. For
  example, `long-typing`: "visible from 2.1 s through the 7.7 s type_text, faded ~5 s after it ended".
- **8, remote devices:** FAIL on run 2 ("no cursor appeared for any of the three remote sessions; cells landed"), then
  PASS on run 3 ("with both windows wholly visible (run 2's windows were likely covered)"). Run 1 stopped before any
  session opened. All three attempts were on `2f9b3bf06ca4`.
- **9, Reduce Motion:** PASS.
- **10, off switches:** PASS. `device-off`: "no cursor; the click brought TextEdit in front (#200)". `session-off`: "one
  cursor only".
- **11, the motion matches the vendor's:** PASS. `motion-vendor`: "the vendor's run (one move refused by the vendor:
  windowNotFoundAtPosition at the right edge)". `motion-cua`: "matches the vendor; the look good as is (halo .hudWindow
  under .aqua, 14 % wash)".
- **12, typing speed:** FAIL. press_key ×30: 929.9 against 827.3 ms, interval [25.67, 286.93] against a bound of 41.36,
  slower. type_text: undetermined. Both series ran under the owner's Korean (2-Set) input source, against the runbook.
- **13, click speed:** FAIL. Element click: 59.92 against 56.23 ms, [2.00, 7.39] against a bound of 2.81, slower; all
  40 were route 3. Coordinate click and drag: undetermined. The `route-3-lag` watch has no verdict.

### What failed, and why

**12 and 13: the window server's work while the cursor is visible.** The diagnosis
(`.doperpowers/sde/2026-10-30-macos-agent-cursor-design/timing-diagnosis.md`, accepted by the design session; the spec's
Decision Log, 2026-10-31) found one root, reached two ways. While the cursor is visible, WindowServer works on every
frame: its CPU is 42 % with the cursor off or never shown, and 57–63 % with it visible, gliding or resting.
- Route 3's `SLSReenableUpdate` waits about 5 ms when the engine's own connection owns an animating window. That gives
  the element click's +3.7 ms.
- TextEdit's two per-key WindowServer calls take 3.76 ms against 1.39 ms. That gives press_key's +3.4 ms a key.
- A route-3 guard waiting an extra sample (H1) and per-request main-thread work (H2) were ruled out by measurement.

The fixes, 4b3031cf..4e875956, change nothing in the look:
- fd2b2d37: thinking starts only after no request has been in flight for 0.3 s.
- 734ebee7:
  - route 3's release runs on a background serial queue, and a capture drains pending releases first;
  - the rock's blur filter is installed only for fades;
  - the arrow's shadow has an explicit `shadowPath` (a pixel diff of composited captures: identical when rocking,
    within 2/255 settled);
  - a strict `cursorDebug` engine.json key (`panelOut`, `noBackdrop`, `noRock`, `legacyLayers`) and timing signposts.
- 4e875956: the kit checks for a Latin input source before every judged series, and records the owner's source and each
  arm as unjudged series.

The fixed build is `b23a6e7a18c6`; reviewer-medium found nothing material. The fixes' first full gate run went red on
parity-browser: 20 undeclared differences in the binder double's `bind-fixture-app` cells. The projection flagged M3's
agent-cursor paragraph from the run's recorded surfaces, `['browser']`, not from the two facades the cell builds.
b2e07997 projects each document by its facade (parity-browser green on run 41192366675; full ci-gate green on
b2e07997, run 41193043307).

**4's front-menu on `2f9b3bf06ca4`.** Two causes were found:
- a recorded menu-bar click moved no cursor (fixed in 37d1e953);
- the frontmost reading lagged the activation notification by 1–17 ms (fixed in 5369088c).

Neither explains seconds of absence (the sitting fix's report,
`.doperpowers/sde/2026-10-30-macos-agent-cursor-design/sitting-fix-report.md`, local to the executing session). With
the fixes, attempt 6 on `9959a76c544a` watched the panel at level 102 above the owner's open menus
(`item-4f-watch.txt`). The probe's run 2 passed (`front-menu-watch.txt`).

**The 34-second recording is not a front-menu try.** It spans 03:58:44–03:59:18Z. On the kit's clock it holds item 4's
fourth attempt, which began at 03:58:57Z: the owner placing the windows, then the clicks at 03:59:10.09, 11.41 and
12.76Z. No menu is open in any frame. The first front-menu try with an owner-opened menu was attempt 5, at
04:04:47–56Z. Attempts 1–3's front-menu steps (03:49:49, 03:52:06 and 03:55:52Z) were the agent's own menu-bar click,
which opens no menu. Both fall outside it.

What the recording does show:
- the cursor fading in at the first point;
- the cursor resting at the second point, at TextEdit's right edge (TextEdit was above Chrome by then:
  `item-4d-order.txt` turns to "TextEdit > Chrome" partway through, #200's raise);
- the cursor gliding back left after the third click, then vanishing in about 0.1 s mid-glide, at about 03:59:12.95Z.

That moment is the session closing, not a cursor fault:
- the attempt's record and log stop in the 6 s wait after the third click, with no close row, so the run was stopped
  there;
- at 03:59:12.947Z the engine logged the UIIntelligenceSupport "agent connection cancelled" line that it logs when a
  cursor panel goes away. In this window that line follows every session close (attempts 2, 3 and 5, and both probe
  runs), and it is paired with an "establishing connection" line at the session's first action;
- the sitting fix's report independently found that panel (44701) ordered out at 03:59:13Z.

The TextEdit-only frames of the vanish are in `sitting/recording-0358/item-4-attempt-4-close-30fps.png`, 30 fps from
offset 28.3 s.

**The front-menu probe's run 1 vanish stays undecided.** The panel was not released:
- the panel's "establishing connection" (05:06:01.908Z) and "cancelled" (05:06:17.818Z) lines bracket the whole run, and
  the cancel matches its close row (05:06:17.867Z);
- WindowServer's RunningBoard assertions on the engine process held from 05:06:01.92 to 05:06:18.08Z.

So the cursor vanished inside a live panel: either the hub hid its layer or the menu covered the panel. No level watch
ran in that run (`front-menu-watch.txt` is run 2's), it has no capture, and no recording covers it.

**8's run 2.** In run 2 the engine created a panel: the same "establishing connection" line at 04:21:34.053Z,
cancelled at 04:21:43.219Z between sessions b's and a's closes, as in run 3. So the hub was drawing for at least one
remote session, and the owner's no-cursor fits the windows being covered, as the note says. One record does not fit
"cells landed": run 2's b click on the page's checkbox read `before "0", after "0"`, unchanged, while run 3's toggled.

**5's focus proof: the kit's first reading.**
- The two "before the cursor" readings (05:37:15.665 and 05:41:22.793Z) found no focused app at all. The probe read the
  system-wide focused application once, right after setting `AXManualAccessibility` on the fixture.
- The fixture's own accessibility record (`run/electron-user-data/cua-fixture-accessibility.jsonl`) shows Chromium's
  accessibility off at both moments. It came on about 2 s later: 05:37:17.632 and 05:41:24.694Z, by poll.
- The key focus was on the fixture at both readings (DictationIM's input-controller lines name the fixture from
  05:37:05.19Z to 05:37:24.60Z, and from 05:41:17.46Z through run 2).
- Every reading taken after accessibility came on named the fixture.

So the reading raced the fixture's accessibility coming up; the activation wait added in 433b20f1 sat before the
session opened and could not cover it. That the focused-app read depends on the target's accessibility being on is an
inference from the timing; the probe keeps no AX error.

The "with the cursor shown" readings:
- run 1 (05:37:19.068Z): the fixture's pid, its window at (140, 100, 720, 560), named, valueHash `e3b0c442…b855`
  (SHA-256 of the empty text field);
- run 2 (05:41:26.145Z): the fixture's pid, but its window at (424, 258, 720, 560), so not named and no hash. The window
  had moved between run 1's end (05:38:20Z) and probe 5 (05:39:29Z), and the scene record still held (140, 100).

Neither run has two usable readings, and the two pairs differ only through the before-reading's failure. The proof
neither passes nor fails. The activation watcher saw no engine activation in either run.

**5's count went from 1 to 4.** The kit expected +2: the agent's press and the owner's click.
- It started at 1, not 0, because run 1's agent press was refused and the owner's click counted 0→1, and the fixture
  was not relaunched.
- The agent's press was one route-1 `AXPress` (8.2 ms). Route 1 never falls through to a synthesized click
  (`deliverAction`, Input.swift).
- In run 1 the owner's one click counted exactly +1.

So the third increment is the owner's: two `click` events (two clicks, or a double click; the fixture counts every
`click`, `renderer.js`). That is an inference: no count was read between the press and the click, and no recording
covers 05:42Z.

**1's `changedWithinMs` is an upper bound, not the change's time.**
- It is measured in the cua_repl cell's own clock (`performance.now()`). It runs from just before `__app.click(index)`
  is called to the moment the observation taken after the click returned has answered (`CLICK_CONTROL`, `ALIGN_TOGGLE`
  in `scripts/cursor-sitting/cells.mjs`).
- The read-back is one observation, not a poll. The new value was read somewhere inside it, between `ms` and
  `changedWithinMs`:

  | run | control | `ms` | `changedWithinMs` |
  |---|---|---|---|
  | 03:19Z | TextEdit alignment | 179 | 635 |
  | 03:19Z | Chrome checkbox | 55 | 435 |
  | 03:38Z | TextEdit alignment | 148 | 582 |
  | 03:38Z | Chrome checkbox | 61 | 440 |

- The cursor's arrival is the dip at `beginTime + arrivalIndex/240` (`CursorHub.swift`, on the engine's host clock).
  It is on disk for no run: `2f9b3bf06ca4` has no signposts, the engine logs no motion plan, and the kit records only
  the cell's times. Even the fixed build's signposts carry neither value.
- The two clocks were never joined.

So the order of the change against the arrival is undecided by measurement. A 0.34–0.97 s glide (the Design's figure)
can end before or after a 435 ms bound. Item 1's click-before-arrival clause rests on the owner's watch ("dip seen";
neither recording covers 03:19 or 03:38Z).

What the code says (an inference, not a measurement):
- the route-1 action follows the cursor's `act` at once, and the dip comes at least the 20 ms lead after it;
- so for TextEdit, whose `AXPress` is synchronous, the change should precede the dip;
- for Chrome, whose page applies the press asynchronously, nothing bounds the order.

### The refusals

Thirteen actions in items 5, 6 and 7 were refused with −10016. The only source of both sentences is the engine's
intervention ledger (`Intervention.swift`). The ledger needs an input event attributed to a driven app, whose source pid
(field 41) is not the engine's own. **The ledger is kept only in memory and nothing is logged**, so no refusal can be
traced to its event's source pid, type or time. The kit did not keep the refusal's response meta (`cua/hidIdleMs`, the
time since the last attributed event), which the engine sends on refusals too. Each refusal is classified instead by:
- the rule its sentence and timing imply: the live debounce ("still interacting"), the sticky re-query flag ("user
  changed", the debounce over), or an in-flight stop ("user changed" during an action);
- the window its trigger must lie in;
- the owner's cued inputs;
- the key-focus trace (DictationIM's input-controller lines in the unified log).

| # | item, time | rule | the trigger lay in | class |
|---|---|---|---|---|
| 1 | 5 run 1, the agent's press, 05:38:02.35 | debounce | 05:37:57.35–05:38:02.35 | (b): the key focus moved from the owner's terminal to the fixture at 05:37:59.20, before "go" |
| 2 | 5 run 1, the next action, 05:38:08.90 | sticky | before 05:38:03.90 | (c): #1's event, with no observation between |
| 3 | 5 run 1, a scroll, 05:38:14.62 | debounce | 05:38:09.62–05:38:14.62 | (b): the owner's click on the tip (the count 0→1, with the agent's press refused) |
| 4 | 5 run 2, the next action, 05:42:08.77 | debounce | 05:42:03.77–05:42:08.77 | (b): the owner's cued click (cue 05:42:02.66) |
| 5 | 6 run 1, before the minimise, 05:12:26.70 | sticky | 05:12:11.55–05:12:21.70 | (c): an event while the owner switched Spaces away and back on cue (05:12:11.6, 05:12:18.1); its source is undetermined |
| 6 | 6 run 1, in full screen, 05:17:02.51 | debounce | 05:16:57.51–05:17:02.51 | (b): the owner putting TextEdit into full screen on cue; TextEdit re-took the key focus at 05:16:52.25 and 05:17:00.85 |
| 7 | 7 run 1, the 7 s type_text, stopped 2.02 s in (05:44:03.62–05:44:05.64) | in flight | 05:44:03.62–05:44:05.64 | (b) by elimination, unconfirmed: no cue |
| 8 | 7 run 1, press_key after the fade, 05:44:12.98 | sticky | #7's | (c) |
| 9 | 7 run 1, a click, 05:44:14.57 | sticky | #7's | (c) |
| 10 | 7 run 1, press_key after the owner's click, 05:44:23.41 | debounce | 05:44:18.41–05:44:23.41 | (b): the owner's cued click (cue 05:44:14.57) |
| 11 | 7 run 2, press_key after the fade, 05:45:57.23 | debounce | 05:45:52.23–05:45:57.23 | (b) by elimination, unconfirmed: no cue; the type_text had ended at 05:45:49.37 |
| 12 | 7 run 2, a click, 05:45:58.93 | debounce | 05:45:53.93–05:45:58.93 | (b) by elimination, unconfirmed: #11's event or a later one |
| 13 | 7 run 2, press_key after the owner's click, 05:46:07.72 | debounce | 05:46:02.72–05:46:07.72 | (b): the owner's cued click (cue 05:45:58.93) |

**(a), the engine's own events counted as the user's: none.** The ledger records can't show it, but the records'
sequences can. Every action the engine posted while nobody touched the app ran to its end unrefused, and a
type_text is checked between every one of its events:
- item 12's 40 type_texts of 200 characters and 40 series of 30 press_keys;
- item 13's 120 clicks and drags;
- item 5's two scrolls in a row, with no observation between (an attributed first scroll would have set the sticky
  flag and refused the second);
- item 7's click and 300-character type_text just before #7's.

#7's own type_text had posted several hundred characters through the same poster before it stopped (roughly 700–800
at the run's typing rate; the meta's `entered` count was not kept), with the in-flight check between every event.
Had the engine's events been attributed, it would have stopped at the second, as every type_text above would have.

**(b), the owner's input:** six confirmed by a cue or the key-focus trace; three by elimination. For #7, #11 and #12, nothing
in the records points to another input source, but nothing on disk names the event either. No recording covers 05:44–05:46Z.

**(c), the staleness contract:** four. Each is the sticky re-query flag left by an earlier attributed event while the
agent acted again without a `get_app_state`. This matches the vendor:
- in the vendor, too, only a completed `get_app_state` clears the flag, and only once the debounce is over; every input
  request is gated (F §9.1, §9.5);
- spot-checked in the helper's readable intermediates (26.923, `~/codex-app-src/readable/cua-service-26.923/`): the two
  sentences (`service.strings.txt`); the gate 0x10014db0c calling `isDebouncing` (0x1000a0cc8) with the literal 5;
  `registerUserInterruptedIntervention` (0x1000a248c) called only from the monitor's handler (0x1000a0ec4);
  `clearUserInterruptedInterventionAfterStateRequery` (0x1000a2e5c) called from one site (0x10015723c).

The two declared differences show here:
- cua refuses at once during the debounce, where the vendor waits it out (250 ms poll, 100 s cap) and then answers
  "user changed";
- cua stops an action in flight (#7), where the vendor never does.

The kit's later label, "observe (the engine asks for a fresh state after the document changed)", misreads the rule. No
refusal comes from the document changing: every one needs an attributed input event. Comments for #208 and #219 on
these findings went to the design session as drafts.

### What is left for the second sitting

The runbook's "The second sitting" (build `b23a6e7a18c6`, records into `sitting-2026-10-31/`):
1. install and approve;
2. item 3 again, with a 30-second look check;
3. item 13, with an undetermined series rerun at 40;
4. item 12, likewise;
5. the `legacyLayers` arm for both, recorded;
6. the owner's-source typing series, recorded;
7. keep or restore.

Not in that list, and open from this sitting:
- Item 5's focus proof, unmet. It needs the kit fix first (tech-debt-tracker.md, 2026-10-31).
- Item 1's click-before-arrival clause, unmeasured. Deciding it needs the motion's `beginTime` and `arrivalIndex` and
  the action's return on one clock: a signpost, which changes the build, or a capture at display rate of both controls.
- The QuickTime clause of item 5.
- The three unrecorded checks above (item 4's attempt 5, item 8's run 2, the probe's run-1 vanish). The design session
  asks the owner whether they recorded them elsewhere.
- The keep-or-restore decision, still pending.

## M3, the second attended sitting (2026-10-31)

The records place the owner at the MacBook from the input-source consent (14:03:01Z) to about 16:13Z: the
`route-3-lag` verdict was written at 16:13:00Z, and the last HID input the engine's meta implies is at 16:12:19Z
(below). They hold nothing between the approval (14:07:09Z) and item 3's first run (15:04:43Z). The timing began at
15:59:23Z under `caffeinate` and ran unattended after 16:13Z until 16:58:13Z, apart from two interruptions at
16:38–16:39Z (below). Every time below is UTC. The attribution's own notes give local times (PDT, UTC−7); they are
converted here.

The records are in `docs/evidence/2026-10-30-macos-agent-cursor/sitting-2026-10-31/` (b43f837a):
- `verdicts.jsonl`, the verdicts with the owner's words in the notes;
- `item-*.jsonl`, each run's steps, and `look/item-11-cua.jsonl`, the look check's moves;
- `timing.md`, the judged series, and `timing-recorded.md`, the arms and the 2-Set Korean series, never judged;
- `input-source.json`, the consent and the source the kit kept as the owner's;
- `windowserver-cpu.tsv`, WindowServer's CPU once a second from 16:27:55 to 16:58:42Z;
- item 5's screenshot, and its activation watcher's `activations.jsonl` and `live-watch.json`.

The engine's signposts (about 400 MB) stay outside the repository, at
`~/.local/share/cua-235/sitting-2026-10-31/signposts/` with their SHA-256s. The operator's build, approve and
per-series logs are beside them. The runbook is "The second
sitting" in that evidence directory's `README.md`.

### What ran, and on which build

One build served the whole sitting: `b23a6e7a18c6`, the timing fixes' reviewed build. It is still installed and
approved. Each arm's `engine-status` row reads that build, approved, `cursor: on` and the arm's `cursorDebug`.
`engine.json` held no arm before any arm ran (`existed: false`), and each arm removed its own after its last sample.

The first `engine build` was refused with `engine_busy`. Another session's REPL supervisor had kept its engine socket
open after its `end_task` (cua #237). The records keep no time for that refusal. Once the socket was gone, the build
installed and the approval completed at 14:07:09Z (`approve.log`).

The kit was 0c0c15f4, which raised the recorder's start bound to 5 s after the hosted test gate refused two slow
stand-in recorders. During the sitting, 5cfd0935 and ea71a376 (15:10Z) added a series under a named input source, for
step 8. The owner's usual source is ABC, and the consent recorded ABC as theirs. The runbook had expected 2-Set Korean,
the source the first sitting's typing ran under. With ABC as the owner's source, `--owner-source` would have repeated
the judged condition, so by the design session's ruling step 8 ran under 2-Set Korean. The kit switched the sources
with the owner's consent.

| time (Z) | what | record |
|---|---|---|
| 14:03:01 | the source consent: yes, the owner's source ABC | `input-source.json` |
| 14:07:09 | build `b23a6e7a18c6` approved | `approve.log`, outside the repository |
| 15:04:43–15:07:58 | item 3, three runs | `item-3.jsonl` |
| 15:09:08, 15:24:58 | the look: item 11's moves on cua's engine, twice | `look/item-11-cua.jsonl` |
| 15:26:37–15:58:51 | the recorder's proof, nine attempts, each refused before recording | `item-1-check.jsonl` |
| 15:48:14–15:49:00 | item 5, between the proof's seventh and eighth attempts | `item-5.jsonl` |
| 15:59:23–16:08:42 | item 13: coordinate click and drag at 40 a side, element click at 20 | `item-13.jsonl` |
| 16:09:12 | element click at 40, refused at its source selection (the popover, below) | `item-13.jsonl` |
| 16:10:29–16:10:52 | item 11's moves into a scratch directory, which dismissed the popover | outside the repository |
| 16:11:15–16:20:47 | element click at 40 | `item-13.jsonl` |
| 16:21:26–16:26:44 | item 12: type_text and press_key at 20 | `item-12.jsonl` |
| 16:27:16–16:32:49 | the `legacyLayers` arm, typing | `item-12-legacyLayers.jsonl` |
| 16:33:04–16:38:07 | the `legacyLayers` arm, clicks | `item-13-legacyLayers.jsonl` |
| 16:38:42, 16:39:09 | the `panelOut` and `noBackdrop` arms, each stopped before its first sample (below) | their items |
| 16:40:30–16:46:20 | the `panelOut` arm, typing | `item-12-panelOut.jsonl` |
| 16:46:35–16:52:33 | the `noBackdrop` arm, typing | `item-12-noBackdrop.jsonl` |
| 16:52:48–16:58:13 | typing under 2-Set Korean, then ABC selected again and read back | `item-12-source-2SetKorean.jsonl` |

Against the runbook:
- item 1 did not run (below);
- the `legacyLayers` typing ran before its clicks;
- `panelOut` and `noBackdrop` ran because press_key failed, as the runbook allows only when 5 or 6 fails.

### The verdicts

Each item's last verdict per watch, with the owner's words where the note carries them:

- **1, it shows where the agent acts:** no verdict. The recording could not be made, and `drive 1 --no-clip` goes to the
  next unattended run.
- **3, states and timing:** PASS on all six watches, each "owner ticked it (second run; the owner missed the first)".
  `item-3.jsonl` holds three runs (15:04:43, 15:06:02 and 15:07:31Z), and the note does not say which of them it names.
  Run 2's last two actions were refused (below).
- **3, the look:** PASS. "the owner: 'I think so, but it's not a one-to-one comparison with a video recording, so I
  can't be sure. They look the same.' (the eight moves, shown twice)".
- **5, never in the way:** PASS on four watches.
  - `taken-over`: "owner ticked: half-transparent on their click".
  - `screenshot`: "owner: cursor on screen over the fixture at the end; the agent's screenshot item-5-step-24-0.jpg has
    no cursor (checked by the operator)".
  - `focus`: "both readings usable (accessibility wait primed, 2.2 s) and equal field by field: fixture pid 25295, its
    window 720x560 at 140,100, named, the same valueHash; the kit's same:false is the readings' key order only (kit
    defect)". The before-reading (15:48:22.153Z) waited 2221 ms with the probe's priming. The reading with the cursor
    shown (15:48:25.569Z) waited 0 ms. Both name the fixture's window and hash `e3b0c442…b855`. The kit's row has `ok:
    false, same: false` because the two `focusedApp` objects carry their keys in different orders (`{pid, bundleId}`
    against `{bundleId, pid}`). 17853326 compares them with their keys sorted. The verdict is the operator's reading
    field by field.
  - `count`: "0 -> 3: the agent's one press (route 1), and the owner clicked the tip several times ('I clicked it many
    times. It worked as it should'); the fixture counts 'click' only". The count read 0 at 15:48:25.839Z and 3 at
    15:48:52.031Z.
  - The activation watcher saw 0 engine activations.
  - `recording`: no verdict. It was to come from item 1's clip.
- **12, typing speed:** FAIL. press_key ×30 is slower; type_text is the same within noise (the timing, below).
- **13, click speed:** `timing.md` reads FAIL, but no series is slower. Element click is the same within noise.
  Coordinate click and drag are undetermined at 40 a side. By the design session's ruling the rule ends at 40, and an
  undetermined series becomes a declared gap for the owner, never more sampling: sampling until a pass would bias the
  verdict.
  - `route-3-lag`: PASS, by the fallback. "the owner watched the clicks block's first minute (the fallback; item 1's
    clip could not be made): 'Looked prompt'". The watch row is in item 13's first run (15:59:29Z) and in the element
    click's rerun (16:11:20Z), and the verdict was written at 16:13:00Z, so the note does not say which run's first
    minute it was. `summary.md` also shows this verdict under 13-legacyLayers, whose own watch row (16:33:11Z) has no
    verdict in `verdicts.jsonl`.

### What failed or was refused, and why

**Item 1's recording: nine placements refused.** Each attempt of the recorder's proof stopped at `record-start`, before
any session opened. The recorder never started: there is no `record-stop` row, and the recordings directory is empty.

| attempt | time (Z) | frontmost | the guard's reason |
|---|---|---|---|
| 1 | 15:27:54 | – | Chrome's run window not on screen |
| 2 | 15:28:58 | cmux, the operator's terminal | its window 19462 (1438 × 825 pt at (26, 59)) over the region |
| 3 | 15:30:04 | Finder | its window 46699 (920 × 436 pt at (392, 239)) over the region |
| 4 | 15:34:03 | Chrome for Testing | a harness window frontmost |
| 5 | 15:43:53 | TextEdit | a harness window frontmost |
| 6 | 15:45:56 | cmux | its window 19462 over the region |
| 7 | 15:46:53 | Finder | Chrome at x −810 and TextEdit at x 1500: the region 2973 pt wide, mostly neither window |
| 8 | 15:52:44 | Finder | the same as 7 (a new clip name, `-b`) |
| 9 | 15:58:51 | the Electron fixture | its window 46727 (720 × 560 pt at (140, 100)) over the region |

Attempts 7 and 8 followed a click on the wallpaper. On the owner's Mac that click reveals the desktop, which slides
TextEdit and Chrome off screen. Item 5, run between attempts 7 and 8, left the fixture frontmost, which fits attempt 9.
The ruling at the sitting dropped the clip: item 1's order comes instead from the engine's own numbers,
`drive 1 --no-clip` and `order-meta` (17853326), in a later unattended run with the owner's ok. The run then:
- reads what lies over Chrome's window by the engine's occlusion rule;
- requires the positioning scroll (99e2f375);
- compiles the window-list probe before the session opens;
- reads the order as undetermined when more than 4 s separate the scroll from the click (3a187bfb).

**A TextEdit popover after the drags.** The element click's first rerun stopped at 16:09:13.621Z: "the frontmost app's
top window is 46610, not the run window 46372". TextEdit had raised a 53 × 48 pt window, unnamed, at (796, 464), after
the clicks series' drags, and it stayed more than 30 s. It is likely the affordance macOS shows beside a text
selection (Writing Tools). The kit selects a source only while the run window is on top, since a per-document source
would change another window's. Item 11's moves, run untimed into a scratch directory at 16:10:29–16:10:52Z, dismissed
it, and the rerun at 16:11:15Z went ahead.
- The kit's first answer, 4cb5ec0f, was a click to dismiss such a window first. Its review found that the click could
  land on the small window itself (P1).
- 0a79e6a3 replaces it. Each timed drag is followed by `CLEAR_SELECTION`, untimed and required: a caret written by an
  element action, refused unless its observation is of the run window. No coordinate input is sent while a window other
  than the run window may hold the focus.
- e82f2453 anchors the caret at a line the document holds once, since `select_text` refuses a text found twice ("Line"
  is in the document 60 times).

**Two arms interrupted, and the source left as it was.** The first `panelOut` run stopped at 16:38:55.506Z when the
owner's Chrome (pid 92136) came to the front. The first `noBackdrop` run stopped at 16:39:22.160Z when cmux (pid 95245)
did. In both, the target guard refused before the first sample, so neither run timed anything. The records keep only
the cleanup row; the reruns overwrote their logs. Both were rerun after the owner's ok, at 16:40:30 and 16:46:35Z. The
element click's run ended the same way at 16:20:48.041Z: two of its cells had answered failed, and at its cleanup cmux
was in front. Each cleanup recorded `source-left-after-failure`. The source left selected was ABC, the owner's own.

**Five refusals, in three items.** Each refusal's meta now carries `hidIdleMs`, the engine's HID idle read
(`hidIdleMilliseconds()`) at the refused request. Subtracting it from `receivedAt` gives the time of the last HID input
before that request. Where two readings trace back to one input, they give the same instant to the millisecond.

| item, time (Z) | sentence | `hidIdleMs` | the input at | reading |
|---|---|---|---|---|
| 3 run 2, "the agent acts again", 15:06:27.318 | still interacting | 4154 | 15:06:23.164 | 10.7 s after the cue to click (15:06:12.428Z): the debounce |
| 3 run 2, "a click, then end_task at once", 15:06:28.584 | user changed | 5420 | 15:06:23.164 | the same input: the sticky flag. The kit's observation at 15:06:27.200Z fell inside the debounce and did not clear it |
| 5, the next action with no observation first, 15:48:46.110 | still interacting | 2845 | 15:48:43.265 | the designed refusal: the owner's click, 3.2 s after the cue (15:48:40.046Z) |
| 13, element click off 2, 16:12:01.768 | still interacting | 3345 | 16:11:58.423 | the debounce |
| 13, element click on 4, 16:12:22.725 | still interacting | 3447 | 16:12:19.278 | the debounce |

- Item 3's runs 1 and 3 had no refusal.
- Item 13's two are the "2 timed call(s) failed" of `timing.md`, left out of the samples (hence 39 a side). Both
  inputs fell in that run's first 65 s, before the `route-3-lag` verdict was written. Nothing on disk names them, so by
  the first sitting's classes they are the owner's by elimination.
- The run's later meta places the last HID input at the same 16:12:19.278Z. Every `hidIdleMs` from 16:12:22Z to the
  run's end (73 rows) implies that instant: it reads 466,543 ms at 16:20:05.821Z and 501,644 ms at 16:20:40.922Z.
- Every prime and element click in that span posted the route-3 guard's activation click (`activationClick:
  "posted"`), so the engine's own activation clicks did not reset the counter the meta reads. The records do not say
  whether those clicks go through the HID tap that the spec's design note on HID idle asks about.

**A recorder check that ran after the call for no live GUI.** In task 7's review round, before the sitting, the
executor's live check of the recorder ran before the design session's "no live GUI runs" message reached it. The check
drew a probe's own banded window and recorded a region inside it, at most 5 s a run. The report's table lists eight
recorder runs, while the progress log counts two clips. Every clip and frame was deleted (`task-7-report.md`), and
this was disclosed to the design session and the owner.

### The timing

Judged by #171's noise rule (`timing.md`), under ABC. Each series comes from the last run that covers it:

| series | n on / off | median on (ms) | median off (ms) | 95 % interval (ms) | bound (ms) | verdict |
|---|---|---|---|---|---|---|
| type_text | 20 / 20 | 547.47 | 544.38 | [−16.85, 18.66] | 27.22 | same within noise |
| press_key ×30 | 20 / 20 | 301.23 | 269.09 | [16.32, 61.77] | 13.45 | slower |
| coordinate click | 40 / 40 | 5.79 | 3.92 | [−0.70, 3.20] | 1.00 | undetermined |
| element click | 39 / 39 | 53.45 | 56.62 | [−6.31, 2.56] | 2.83 | same within noise |
| drag | 40 / 40 | 5.79 | 4.80 | [−0.77, 3.25] | 1.00 | undetermined |

- Element click at 20 (the first run) was undetermined: 57.73 against 55.63 ms, [−0.97, 6.18] against a bound of 2.78.
  This is from the operator's log (`timing-clicks.log`, outside the repository), since `judge` keeps each series' last
  run only.
- The element clicks' routes: route 3 × 78, and none for the two refused.
- press_key is +32.14 ms per 30 keys, about +1.07 ms a key, against +3.4 ms a key at the first sitting.
- Element click went from slower (59.92 against 56.23 ms) to the same within noise.
- The vendor's click returns only after its glide (VC §3), so its keys never run during a glide. cua pays about 1 ms a
  key during the glide, where the vendor pays 0.34–0.97 s on every click. No vendor arm was run (the Decision Log).

Recorded, never judged (`timing-recorded.md`), the rule's numbers per series:

| series | input source | type_text: on / off (ms), interval, bound | type_text | press_key ×30: on / off (ms), interval, bound | press_key |
|---|---|---|---|---|---|
| `legacyLayers` | ABC | 537.16 / 522.32, [−2.18, 40.27], 26.12 | undetermined | 429.02 / 359.63, [40.56, 97.77], 17.98 | slower, +69.39 |
| `noBackdrop` | ABC | 549.51 / 525.27, [−14.15, 40.85], 26.26 | undetermined | 572.46 / 519.57, [16.14, 120.59], 25.98 | slower, +52.89 |
| `panelOut` | ABC | 562.94 / 594.16, [−53.94, 0.14], 29.71 | same within noise | 520.43 / 519.55, [−69.70, 61.88], 25.98 | undetermined |
| default layers | 2-Set Korean | 61.62 / 55.97, [−1.61, 12.40], 2.80 | undetermined | 1089.97 / 969.30, [9.65, 197.28], 48.46 | slower, +120.67 |

13-legacyLayers, clicks at 20 a side, are all undetermined:

| series | on / off (ms) | interval (ms) | bound (ms) |
|---|---|---|---|
| coordinate click | 79.21 / 78.71 | [−14.11, 10.50] | 3.94 |
| element click | 53.44 / 52.57 | [−1.63, 4.78] | 2.63 |
| drag | 87.90 / 87.90 | [−14.05, 5.94] | 4.39 |

What the recorded series say, as the design session read them:
- `legacyLayers` brings back the first build's layers, and its press_key costs +69 ms against the fixed build's +32. So
  the fixes removed about half the cost.
- `noBackdrop` is still slower, so the halo's blur is not the cost.
- `panelOut` is too noisy to show that the panel is the cost.
- The off medians drifted over the hour: press_key off was 269.09 ms in item 12, 359.63 under `legacyLayers`, and
  519.57 and 519.55 ms under `noBackdrop` and `panelOut`. So each arm is read only as on against off within its own
  series.
- 13-legacyLayers measures something else. From its sample 4 on, TextEdit did not believe it had focus, so its
  coordinate clicks and drags ran route 3's activation guard on both sides: 32 of its 40 rows carry
  `activationGuardMs`, against none of the judged run's 80. Its 79–88 ms are not comparable with the judged 5.79 ms.
- type_text took about 60 ms under 2-Set Korean against about 545 ms under ABC. The records do not say why.

### Where the extra time goes

The attribution (`.doperpowers/sde/2026-10-30-macos-agent-cursor-design/sitting-2-attribution.md`; the Decision Log,
2026-10-31) places the extra time inside the engine's request, in all three series:
- the legs outside the engine differ by at most 0.1 ms a call;
- the socket time outside the request signpost differs by at most 0.05 ms;
- the cursor's hooks are asynchronous (`cursor.end` to request end, +0.01 ms a call), and no series makes a `main.sync`
  hop on either side.

The time goes to waits on other processes, and those waits grow while the cursor's panel is on screen and WindowServer
is busier. Per series:
- **press_key ×30** (signposted samples, 13 on and 14 off of the 20 a side): the request is +36.15 ms of the call's
  +37.63 (medians). Of it:
  - `pressKey.keyboardTarget`, the AX focused-element read into TextEdit: +17.55 ms median, +23.20 mean [8.60, 38.97];
  - the request prologue before `cursor.begin` (the lock check through `CGSessionCopyCurrentDictionary`, the HID idle
    read, the app resolve): +6.66 median, +6.70 mean [0.40, 13.16];
  - `pressKey.post` does not move, and the REPL, service and wire together add +2.50 ms [−1.77, 6.64].
- **Coordinate click** (+1.87 ms): the judged run has no signposts. Its meta puts the extra between `receivedAt` and
  the first posted event: +2.00 ms [1.00, 3.00], on the engine's 1 ms clock. The REPL, service and post-and-reply legs
  are +0.05, +0.07 and −0.25 ms. The nearest signposted click is item 12's gliding click, 400 ms after its prime. There
  only the prologue moves, +0.57 ms [0.15, 1.88] median. The method body (hit test, window number, post) moves +0.12.
  The rest of the +1.87 lies inside the request, and these data cannot say where.
- **Drag** (+0.99 ms): the meta alone, +1.00 ms [0.00, 2.00] between `receivedAt` and the first event. The drag runs
  about 70 ms after the element click, while the on side's cursor glides to the fixture.
- **WindowServer's CPU** (the arms and the 2-Set Korean series only; the record starts after item 12). Over each sample's own cells, on minus off:

  | series | median on / off (%) | on − off, 95 % |
  |---|---|---|
  | 12-legacyLayers | 44.7 / 14.6 | +30.1 [29.2, 32.0] |
  | 12-noBackdrop | 35.4 / 10.8 | +24.6 [22.8, 26.3] |
  | 12-source-2SetKorean | 35.2 / 10.8 | +24.3 [23.4, 26.2] |
  | 12-panelOut | 14.1 / 13.6 | +0.4 [−0.9, 1.8] |
  | 13-legacyLayers | 48.2 / 29.1 | +19.1 [12.5, 21.7] |

  `panelOut` runs all of the cursor's engine work with the panel off screen. Under it, WindowServer is the same on and
  off, and so is press_key (520.43 against 519.55 ms). The cost follows the panel being composited, not the engine's
  cursor work.
- **The layer fix**, default against `legacyLayers`, press_key:
  - the prologue's extra halves, +15.51 to +6.66 ms median;
  - `keyboardTarget`'s extra falls from +33.95 to +17.55 median, but the intervals overlap;
  - the cursor's own window-list read shortens from 5.3 to 4.25 ms.

  On the signposted subsets the mean request extras are equal (+44.06 against +43.92 ms), so the halving the judged
  series show is not resolved interval by interval.
- **Element click**, for completeness: the request is equal, −0.40 ms [−4.65, 4.47]. Route 3's release takes
  +4.56 ms on the release queue, after the request has returned, so the earlier fix holds.

The limits:
- **Signpost coverage.** `log show` after each run kept only the tail. Item 13's signposts begin at 16:18:29Z, so the
  judged coordinate click and drag (15:59–16:08Z) have none, and the element click's rerun has 9 on and 10 off. The
  attribution's text says it lost "half" of that rerun; its own counts say about three quarters. Item 12 has 27 of its
  40 samples, 12-legacyLayers 21, 13-legacyLayers about 25.
- **The prologue is one interval,** and that its two calls are WindowServer round trips is read from the APIs, not
  measured.
- **n is 9 to 14 a side** in every signposted comparison.

The kit's answer, for the next run (the reviews' rounds in `task-8-report.md`):
- 2a755cda streamed the signposts.
- d74acb61 took the stream off the timed samples. A live `log stream --signpost` costs the emitting engine 78.6 µs an
  interval against 1.7, about 24 ms a press_key sample, and more on the cursor-on side.
- d74acb61, faa5364e and 798a16a4 read the engine's signposts with chunked `log show`, only in the 6 s gaps between
  samples, with a 1 s settle margin, an overdue read forced after 60 s, each read cut at 15 s and recorded. Coverage is
  checked per cell, and a series not covered reads incomplete.
- 4ff410f7 and e24948ad added sub-intervals inside the prologue (`prologue.hidIdle`, `prologue.lockCheck`, …) and the
  coordinate click (`click.hitTest`, `click.windowNumber`, `click.route`, …), behind an `isEnabled` check.

**The design note, not built** (the Decision Log). There are two candidates for the press_key decision after the next
run. Both touch the request prologue in `Methods.swift`, #211's overlap, so building either is its own ruling.
- The lock state: seed it at launch and follow `com.apple.screenIsLocked` and `com.apple.screenIsUnlocked`, instead of
  a `CGSessionCopyCurrentDictionary` round trip on every request. Re-read it directly before any refusal decision.
- HID idle: IOHIDSystem's `HIDIdleTime` instead of `CGEventSource.secondsSinceLastEventType`. First measure whether the
  engine's own posts reset either counter, since the intervention ledger depends on the answer.

### What is left

The next unattended run (the Decision Log, b4fd4a5e) takes about 15–17 minutes and needs the owner's ok first. It runs
on the scratch build `3cdf06462f92`, head 798a16a4; 1b2d2f96 after it changes only the kit. It must be built and
approved first: the installed engine is still `b23a6e7a18c6`. The run:
1. item 1, `drive 1 --no-clip`, then `order-meta`;
2. `timing typing --still`: press_key with the cursor visible and still after its glide, to show whether the cost is
   confined to motion;
3. the `fps60` arm (149c24ef, 1b85e7c0). It caps every cursor animation at 60 Hz on this 120 Hz display and splits
   held keyframe values out. Its proof that the cap took effect runs before the arm's sessions open, from WindowServer's
   `FrameUpdate` signposts. On the probe it measured a frame every 16.7 ms against the default's 8.3, and the rock at 60
   against 114 frames a second. A pose test shows its motion equal to the default's (worst 2.1e-6 pt);
4. a same-session control of the default arm (`--control`, 1b2d2f96), recorded under `item-12-control` (or
   `item-13-control` for clicks) and never judged, since the off medians drift;
5. WindowServer's CPU sampled throughout, and the signposts read as above.

Not in that run, and open:
- Coordinate click and drag: undetermined at 40, a declared gap for the owner.
- press_key: the decision waits on the next run; then the design note's two candidates.
- Item 5's recording clause: no verdict. The next run records no clip.
- Keep or restore: the owner chose to keep this branch's build (answered 2026-10-31, after the sitting). The next run replaces it with the scratch build `3cdf06462f92`, which then stays installed. The saved engine stays at `$SAVED`.

## M3, after the second sitting: the unattended runs and the owner's acceptances (2026-10-31)

After the second sitting, two unattended blocks ran: the first unattended run (20:04–20:34Z) and the third block of the
day (20:48–21:07Z), counting the second sitting as the first. Between and after them the kit and the engine were fixed,
the design session ruled, and the owner accepted two limits. One owner run was started at 21:36Z and stopped at 22:20Z
without its step. Every time below is UTC. The unified log's PDT time (UTC−7) is converted.

The records:
- `docs/evidence/2026-10-30-macos-agent-cursor/sitting-2026-10-31b/` (aec2eb15), the first unattended run: `item-1.jsonl`,
  `item-12-still.jsonl`, `item-12-fps60.jsonl`, `item-12-control.jsonl`, `timing-recorded.md`, the three
  `coverage-12-*.json`, `windowserver-cpu.tsv` and `loadavg.tsv`;
- `sitting-2026-10-31c/` (5e4969c5), the third block: the same kinds of file for item 1, fps60 and the control, with the
  block's own `run.log`, `probe.log` and `maws-supervisor-cpu.tsv`;
- `sitting-2026-10-31d/`, the last owner run: only the consent copied from the second sitting, not committed. That run's
  log is outside the repository, at `~/.local/share/cua-235/sitting-2026-10-31d/run.log`.

The engine's signposts and the operator's build, approve, scene and per-series logs are at
`~/.local/share/cua-235/sitting-2026-10-31b/` and `…/sitting-2026-10-31c/`. Each evidence directory has the signposts'
SHA-256s.

| time (Z) | what | record |
|---|---|---|
| 20:04:52 | build `3cdf06462f92` approved | `approve.log`, outside the repository |
| 20:06:11, 20:06:49 | item 1, `drive 1 --no-clip`: two starts, the second refused at its Chrome click | `item-1.jsonl` |
| 20:08:17–20:08:28 | `--still`, first start: stopped before any sample | `item-12-still.jsonl` |
| 20:12:36–20:15:29 | `--still`, second start: every on cell refused, then stopped | `item-12-still.jsonl` |
| 20:16:02–20:21:44 | `--still`, 20 samples a side | `item-12-still.jsonl` |
| 20:22:06–20:27:34 | `--arm fps60`: the cap check, then 20 samples a side | `item-12-fps60.jsonl` |
| 20:28:10–20:33:40 | `--control`, 20 samples a side | `item-12-control.jsonl` |
| 20:40–20:47 | the kit's fixes 941ad92a and 7704399b, reviewed clean | `task-8-report.md` |
| 20:48:50–20:49 | the third block's early start, stopped | `run-early-stop.log`, outside the repository |
| 20:59:50–21:00:25 | the cap probe on a quiet display, bundle and scratch | `probe.log` |
| 21:00:33–21:00:49 | item 1, refused at its session's open | `item-1.jsonl`, `run.log` |
| 21:00:51–21:06:25 | `--arm fps60` on a fresh document | `item-12-fps60.jsonl` |
| 21:06:41–21:06:58 | `--control`, refused at its tidy session | `item-12-control.jsonl`, `run.log` |
| 21:09–21:32 | the rulings, the owner's decisions, the cap-default build | the spec's Decision Log, `fps60-default-report.md` |
| 21:36:29–22:20 | the last owner run, stopped without the hide | `run.log`, outside the repository |

### The first unattended run (20:04–20:34Z)

`cua engine build` installed `3cdf06462f92` (head 798a16a4; 1b2d2f96 after it changes only the kit), and
`cua engine approve` approved it at 20:04:52.188Z. `approve.log` records no prompt, and the owner was not needed. The
owner had chosen to keep this branch's build, so it stayed installed after the run. The scenes came up at
20:05:33–20:05:40Z (TextEdit, Chrome for Testing, the Electron fixture).

**Item 1, refused.** The first start (20:06:11.620Z) holds only its `window-list-ready` row, and the records do not say
why it stopped. The second (20:06:49.687Z) ran:
- TextEdit's alignment click (route 3, 146.7 ms) and the positioning scroll (route 2′);
- then `glide-cover` found three windows over Chrome for Testing's run window (1000 × 760 pt at (80, 60)):
  - cmux's 19462 (pid 95245, 1438 × 825 pt at (26, 59));
  - the owner's Chrome's 46436 (pid 92136, 1512 × 898 pt at (0, 33));
  - the kit's own Electron fixture's 47426 (pid 93114, 720 × 560 pt at (140, 100));
- the checkbox click and its read-back failed: "sceneOption is not in the chrome window's text".

No order verdict was recorded. The kit never moves the owner's windows, so item 1 was left for a run with Chrome and cmux
hidden.

**Two interruptions, each stopped by the kit's guards.** The `--still` series started three times:
- **First start, 20:08:17.775Z.** At 20:08:28.506Z the cleanup row records the frontmost as pid 36558, not TextEdit's
  91447. No cell had run. The design session placed it: the owner opened Activity Monitor through Spotlight at 20:08:27Z.
  The operator's idle read at 20:09:05Z (29.5 s) puts a later input at about 20:08:35Z.
- **Second start, 20:12:36.275Z** (HID idle 1.8 s by the operator's read). All 11 on cells (`still on 0` to `still on 10`,
  20:12:45–20:15:14Z) were refused with −10016, "The user changed '/System/Applications/TextEdit.app'". Every one's
  `hidIdleMs` traces back to one input at 20:12:38.547Z, between the two sessions' opens (20:12:38.052 and 20:12:38.920Z):
  from 6,841 ms at the first to 155,499 ms at the last. The records do not name that input's source. The 11 off cells ran
  and are in `item-12-still.jsonl`. At 20:15:29.695Z the key guard refused `off 11` with cmux (pid 95245) frontmost, and
  the run stopped. The ledger notes it at 20:15:44Z: the owner had touched the Mac again.
- **Third start, 20:16:02.753Z** (HID idle 20.4 s), ran to 20:21:44Z with no refusal.

Neither interrupted start contributes a sample: `judge` reads each series' last run, and the third start's is complete.
Each cleanup recorded `source-left-after-failure`, and the source left was ABC, the owner's own.

**The recorded series** (`timing-recorded.md`, never judged), all under ABC. Each series' signposts cover all 40 samples
(`coverage-12-*.json`, 14, 15 and 14 reads):

| series | type_text: on / off (ms), interval, bound | type_text | press_key ×30: on / off (ms), interval, bound | press_key |
|---|---|---|---|---|
| `--still` | not in the series | – | 249.58 / 234.63, [−1.18, 22.97], 11.73 | undetermined, +14.95 |
| `--arm fps60` | 528.78 / 530.60, [−14.29, 14.63], 26.53 | same within noise | 271.05 / 253.79, [−36.18, 59.48], 12.69 | undetermined, +17.26 |
| `--control` | 540.40 / 535.23, [−12.68, 19.15], 26.76 | same within noise | 408.99 / 356.04, [5.49, 86.18], 17.80 | slower, +52.95 |

TextEdit was not relaunched between these series. press_key's off median rose from 234.63 to 253.79 to 356.04 ms over
them.

**The fps60 cap check: "not capped", and void.** Before the fps60 series the kit ran the cursor probe twice from the
approved bundle (`open -n -g -a … --args --probe cursor --glides 2 [--debug fps60]`):
- default, pid 7641: 2 glides at 119.5 Hz, a frame every 8.3 ms, and the rock at 120 Hz;
- fps60, pid 8689: 119.8 Hz, every 8.3 ms, the rock at 120 Hz.

The verdict was "not capped", against task 8's 16.7 ms on the unbundled scratch executable. The diagnosis
(`task-8-report.md`, "The fps60 arm in the approved bundle reads "not capped"") reads the display as held at 120 Hz by
another client:
- WindowServer's CPU was 33–43 % in the 16 s before the probes (20:21:50–20:22:06Z), while nothing of the kit's drew.
  The same file's quiet stretches read 1.3–2 %.
- The owner's full-screen Chrome and cmux were on that display.
- A read-only `log show` at 20:36Z held 7,063 `FrameUpdate` signposts in a minute, about 118 a second, against about 3 on
  task 8's idle display.
- `FrameUpdate` is display-wide. Its `contributors` field is empty on almost every frame, and the rest of the message
  names no window or client. A capped animation runs at the display's rate whenever any client asks for 120, so the
  count cannot tell a cap ignored from a cap overridden. The 20:22Z signposts were mostly gone from the store (4 left).
- The records cannot show that the arm was applied: the kit dropped the probe's own arm echo. The arguments were parsed,
  since the probe exits 64 on an unknown one and both sides answered with glides.

### The diagnosis and the kit's fixes (20:40–20:47Z)

- **941ad92a.** The probe's `debug` echo is kept, and a side that does not report the arm it was asked for reads
  `undetermined`. The check counts 1.5 s of the `FrameUpdate` stream before the probes (`quiet`). A "not capped" with the
  display already at 100 Hz or more reads `undetermined (held)`.
- **Its review (reviewer-medium) found a P2:** the quiet window was counted by delivery, the frames `log stream` handed
  over while the check slept. The stream delivers late, so a held display could read quiet, and stale frames could make
  a quiet display read held.
- **7704399b.** The window's start and end are marked on `Date.now()`'s clock. The stream keeps each frame's own `log`
  timestamp. After the drain, the quiet rate counts the frames whose timestamps fall inside the window, the way the glides
  are counted against their spans. The new test runs the production stream adapter over a late `log stream`. On
  941ad92a it read a held display at 40 Hz, where 120 was expected. `frames.test.mjs` 11/11, the kit 158/158. The
  re-review of 941ad92a..7704399b was clean (20:47Z).
- No GUI, probe or install ran for either.

### The third block (20:48–21:07Z)

**The early start, stopped at 20:49Z.** `run.sh` started on 7704399b at 20:48Z. Its idle gate passed at 20:48:50Z (HID
idle 31 s, 0 other connections), and its quiet check read 9 `FrameUpdate` in 5 s at 20:48:58Z. The owner had not yet
hidden Chrome and cmux. The script was stopped after about 4 s of the bundle probe's drawing, and it was given a gate on
the two being hidden. The owner then left without hiding them; the last HID input was at 20:48:18–19Z. So by the design
session's ruling the block ran without the hide: the gate was dropped, a quiet-check retry was added, and so was a
sampler for `maws-supervisor`. That process had been at 225–290 % CPU since 20:35:05Z (the design session's reading).
In the block's own 5 s samples it read 0.0–224.6 %.

**The run, from 20:59:50Z** (HID idle 691 s, 0 other connections, Chrome and cmux both visible). The quiet check read
11 `FrameUpdate` in 5 s. Then, before any scene was up, the kit's cap check ran against the approved bundle and the
scratch executable, back to back (`probe.log`):

| binary | quiet before the probes | default: interval, rate, rock | fps60: interval, rate, rock | verdict |
|---|---|---|---|---|
| bundle `3cdf06462f92` | 2 frames in 1.5 s, 1.3 Hz | 8.3 ms, 119.1 Hz, 113 Hz | 16.7 ms, 62.7 Hz, 59 Hz | capped |
| scratch executable | 4 frames in 1.5 s, 2.7 Hz | 8.3 ms, 118.8 Hz, 116 Hz | 16.7 ms, 62 Hz, 61 Hz | capped |

So the bundle takes the cap, and the first run's "not capped" was the held display.

**Item 1, refused.** TextEdit came up at 21:00:28Z, and its recorded window was 47652 (500 × 500 pt at (0, 482)).
Chrome for Testing came up at 21:00:33Z with its record on screen (47655). Item 1 started at 21:00:33.585Z and was refused
at its session's open: "the textedit app's front window is window 47653, not the run's window 47652". `order-meta` then
had no glide-start reading. Chrome went down, and TextEdit was relaunched on a fresh 824-byte document before each later
series.

**The fps60 series, 21:00:51–21:06:25Z.** TextEdit's relaunch at 21:00:50Z recorded window 47669 (612 × 862 pt at
(151, 70)). The series' own cap check (row at 21:01:06Z, probe pids 12953 and 14518) read:
- the quiet window 21:00:52.179–21:00:53.679Z: 127 frames, 84.7 Hz;
- default 119.8 Hz and fps60 118.9 Hz, both every 8.3 ms, the rock 120 against 120 Hz.

The verdict was "not capped": the 100 Hz threshold let a display held at 84.7 Hz through, where `undetermined (held)` was
meant. The series' numbers, recorded:
- type_text 571.31 / 566.52 ms, [−24.84, 21.63], bound 28.33: same within noise;
- press_key ×30 302.57 / 296.52 ms, [−29.76, 44.20], bound 14.83: undetermined, +6.05.

The signposts cover all 40 samples. The operator's idle read at 21:07:10Z (53.7 s) places an HID input at about
21:06:17Z. That is inside the series' last sample, `typing on 19` (21:06:16.285–21:06:18.171Z). Successful cells carry
no `hidIdleMs`, so the records cannot show which samples it touched, and they do not name its source.

**The control, refused.** TextEdit's relaunch at 21:06:41Z recorded window 47685 (500 × 500 pt at (0, 482)). The overlay
check at 21:06:42.186Z found window 47686 (610 × 860 pt at (152, 71)) over it. The tidy session's open was refused: "the
textedit app's front window is window 47686, not the run's window 47685". The block ended at 21:06:58Z with the source
restored to ABC, the scenes down and no `engine.json`.

**The cause, from the unified log.** At TextEdit's launch at 21:00:28Z it opened the run's document and then, at
21:00:29.8Z, after the log line "No windows open yet", its launch-time Open panel through `openAndSavePanelService`. By
the Decision Log that was 1.3 s after the document. That panel was the second window the guards saw.
`fps60-default-report.md` read AppKit's code to find the gate:
- the untitled document, or the Open panel in its place, opens only when `NSRequiresOpenUntitledWindowAtLaunch` is on
  and no window is open yet;
- TextEdit reads RTF in the background, so the check can find no window yet;
- "No windows open yet" is AppKit's automatic-termination reason string, not the decision itself.

The Decision Log reads the fps60 series' held quiet window and the second window as one cause. The records hold nothing
that ties the 84.7 Hz to the panel's window, since `FrameUpdate` names no window. In both refusals the recorded window
was 500 × 500 pt at (0, 482), and the other had the document's usual bounds. The records do not say which of the two
was the panel.

### The rulings, the owner's decisions, and what was built (21:09–21:32Z)

The spec's Decision Log, at its head, has three entries dated 2026-10-31 for this part. Newest first:
- **Building the rulings** (f55fb8b0, 296fc5d3, 0f0f2da8; the entry is 9f021c76).
- **The owner** (through the design session, cua_repl#1ea561bc:148; spec abf36915).
- **The unattended runs and the design session's rulings** (cua_repl#1ea561bc:132–147; spec 8f35f074).

The design session's rulings:
- **fps60 becomes the cursor's default**, with an `uncapped` arm kept so that the cap check has a full-rate side. The
  pose test shows nothing visible changes (worst 2.1e-6 pt), and the cap halves WindowServer's frames for the cursor on
  an idle display.
- **press_key gets no more timed runs.** The Decision Log reads the residual as following TextEdit's redraw of a growing
  document under a busier compositor, not the cursor's own frames. Its numbers:
  - +15.0 ms per 30 keys with the cursor still, undetermined;
  - +6 on the fresh document, undetermined, with that run's cap void;
  - +53.0 for the control on a grown document, slower;
  - press_key's off medians of 234, 254 and 356 ms over one session's series.
- **Two kit fixes:** the TextEdit scene's second window, and a held-display threshold of 50 Hz.
- **Then one short owner run.**

The owner's decisions (21:17Z by the ledger) amend Acceptance 12 and 13:
- **press_key is a stated limit** ("Accept as a stated limit"): about 1 ms a key while the cursor moves (+32 ms per 30
  keys at the second sitting's judged run), up to about 1.8 ms in a large TextEdit document (+53). On a fresh one the series
  read +6 ms per 30 keys, undetermined by the rule (the amendment first said "within noise"; corrected to undetermined).
- **Coordinate click and drag are a stated gap** ("Accept as a stated gap"): +1.87 and +0.99 ms, undetermined at 40
  samples a side, within about 2 ms and not proven within 1 ms.
- type_text and element click pass.
- The pull request lists both among its limits, and the last owner run goes "when it's ready".
- 75c924c8 puts both among the runbook's known limits.

What was built (`fps60-default-report.md`, from 5e4969c5):
- **f55fb8b0:** `HELD_HZ` goes from 100 to 50. The test's five cases are 120, 84.7, 50, 49 and 3 Hz, and on the old code
  it failed at 84.7.
- **296fc5d3:** `CursorFrameRate` caps every cursor animation at 30–60 Hz, preferring 60. The `uncapped` arm restores
  the old rates exactly, and `fps60` is removed rather than kept as an alias that does nothing. engine.json still parses
  strictly, so a leftover `"cursorDebug": "fps60"` stops the engine with the list of arms. The cap check now probes
  `--debug uncapped` first, then the default, and runs only before the `--arm uncapped` series.
- **0f0f2da8:** the TextEdit scene launches with `-NSRequiresOpenUntitledWindowAtLaunch NO`, a launch argument, so no
  defaults are written. `up textedit` records the window only after it has been TextEdit's one on-screen window for
  2.5 s. It fails, recording nothing, on a second window or on none within 20 s.

The checks:
- engine 612/612; the pose guard, uncapped against the default, worst 2.1e-6 pt;
- the kit 158/158, the scenes 131/131, the matrix and kit together 517/517;
- the hosted gates `test` and `engine-swift` GREEN on 0f0f2da8 (run 41243373099);
- reviewer-medium on 8f35f074..0f0f2da8: clean.

None of it was seen on the screen: the next live cap check and scene up are the proof.

### The last owner run (21:36–22:20Z)

`run.sh` started on 9f021c76 at 21:36:29Z:
- **The build.** `a457ad42dac7`, the cap default, was built at 21:37:06Z and approved at 21:37:12.739Z, unattended
  (`approve.log` records no prompt). Its status line: approved, all three grants, 0 other connections, `cursor: on`.
- **The scenes.** On the fix's first live launch, TextEdit came up at 21:37:20Z with one window, 47741 (610 × 860 pt at
  (152, 71)), recorded after the 2.5 s hold. Chrome for Testing came up at 21:37:26Z. Its record named window 47753
  (500 × 500 pt at (0, 482)) and was re-pointed to 47744 at 21:37:27Z.
- **The wait.** At 21:37:27Z the script printed `READY FOR HIDE` and waited for Chrome and cmux to be hidden.

The cue to the owner went out only at about 22:06Z. The session's Monitor delivered the ready line only together with
its expiry notice, after the design session asked for status. Lines the same monitor wrote seconds earlier had arrived at
once (`~/.claude/friction-tracker/general/live/monitor-event-delivered-only-at-expiry.md`). The ledger's line from that
time reads "monitor event not acted on". The friction entry, written after, places the delay in the delivery. The owner
waited about 30 minutes with the test windows up.

With no hide by the 22:20Z deadline, the script was stopped and the scenes taken down. That is from the ledger: `run.log`
has no line after 21:37:27Z, and its `scenes.log` no `down` rows. `a457ad42dac7` stays installed and approved.

### What is left

1. **One owner slot of about 3 minutes, on the design session's GO.**
   `~/.local/share/cua-235/sitting-2026-10-31d/run-slot.sh` writes its records to `sitting-2026-10-31e/`. The scenes come up, and the session tells the owner to hide Chrome and
   cmux as soon as it starts the script, without waiting on a Monitor. The script then waits for HID idle of 15 s and a
   quiet check under 50 `FrameUpdate` in 5 s. Then:
   - the cap check on `a457ad42dac7`, uncapped against the default: the first live proof that the cap is the default
     and that `uncapped` lifts it;
   - item 1, `drive 1 --no-clip`, then `order-meta`;
   - the scenes down, and the summary.
2. **The whole-branch review** at the spec's rung (reviewer-high on fc15e1b8..9f021c76, dispatched 22:21Z): one P2, a keyboard revival in another app left `cursor.app` naming the last pointer app, so a later display change moved the cursor to that app's old point. Fixed in cf6c7b67 (test first; CursorHubTests 44/44, swift test 613/0); the re-review found nothing material. The engine built from cf6c7b67, dd7a09235885, was approved at 22:30:18Z with no prompt.
3. **The pull request**, with press_key's limit and the click gap among its limits.

Not in that slot, and open: item 5's recording clause still has no verdict, since no clip is recorded.
