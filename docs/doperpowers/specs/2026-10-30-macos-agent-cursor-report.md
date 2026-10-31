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
