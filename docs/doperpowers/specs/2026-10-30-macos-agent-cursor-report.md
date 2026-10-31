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
