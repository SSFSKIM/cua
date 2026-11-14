# #292/#288's live check: the EUI release, the grace, and the toolbar's establishment, on a GitHub-hosted macOS runner

**This is #292's and #288's live check** of `fix/288-fresh-chrome`. It ran on a hosted runner, with no owner and no MacBook slot.

- **The probe:** the `probe/288-hosted` branch (`scripts/probe-288/live.mjs`, `scripts/probe-288/ax.swift`, `.github/workflows/probe-288.yml`). It stays off main. `ax.swift` samples Chrome from outside the engine: `watch` reads the application's AXEnhancedUserInterface (EUI), whether the page checkbox's hit lists AXPress, and whether a text field's AXBoundsForRange box is non-empty, every 20 ms (100 ms in the grace cells). `geom` moves and resizes Chrome's window through AX and counts the distinct CGWindowList frames until it settles.
- **The final run:** https://github.com/SSFSKIM/cua/actions/runs/42168334138. The branch is at 63926945, after the review fixes. Main is at d2568c76. Both engines were built on the runner from those commits.
- **The records:** `rep1/results.json` and `rep2/results.json`, one runner each. Each carries the config and, for every cell, the engine's full answers (meta, error), the sampler's state changes with their times, the window frames, the page's counters, and the frontmost app.
- **The earlier run** (`earlier/`): https://github.com/SSFSKIM/cua/actions/runs/42167787338, the same cells at 96c6f093. That was before the review fixes; there end_task wrote endTask and closed without waiting for the answer. Every cell agrees with the final run.
- **The Reload diagnostics** (`reload-idle/`, `reload-idle-2/`): runs https://github.com/SSFSKIM/cua/actions/runs/42169259575 and https://github.com/SSFSKIM/cua/actions/runs/42169900108, both at 63926945. See "Reload after a toolbar re-layout" below.
- **The reps agree in every cell.**

**The measured config:**
- Final run, both reps: GitHub's macos26 image 20261102.0473.1, macOS 26.7.2 (25G332), Chrome for Testing 156.0.8078.80.
- Earlier run, both reps: image 20261026.0455.2, macOS 26.6.2 (25G83), Chrome for Testing 156.0.8078.47.
- Stable Chrome on the owner's Mac is unmeasured.

**The grants.** As in #282's evidence: the image grants Accessibility, PostEvent and Screen Recording to `/bin/bash`, and an unbundled debug `cua-engine` run as a child of the job's shell inherits them.

**The setup.**
- Each cell gets a fresh Chrome for Testing, a fresh engine process and a fresh connection, in shared mode (`ping` names no desktop). TextEdit sits frontmost beside Chrome.
- The page holds a checkbox, an Apply button, an input, a two-line textarea, and a paragraph of plain text. It counts pointer, mouse, key, change and focus events, and reports the active element and the textarea's selection.
- "Observe" means `get_app_state {pid}`, with a screenshot where a coordinate click follows. "After obs" is the time from that call's answer.
- The client's end_task path follows client.mjs at 63926945: `endTask`, then the close once it is answered (at most 1 s). At 96c6f093 the close followed the write at once.
- "Latency" is the click call's wall time.

## Results (rep1 / rep2, final run at 63926945)

### Release

| Cell | Engine | Observation's enablement | Before the end | After the end | Window move/resize after |
|---|---|---|---|---|---|
| 1, end_task, 2.6 s after obs | branch | prior false, write `success`, error -25208, enabled EUI | EUI true, AXPress, boxes | `endTask` → `{released: 1}` in 2 ms. **EUI false, AXPress gone, boxes empty at the first sample, 12 / 15 ms** | 2 frames, 8–55 ms (before the observation: 1–2 frames, 10–60 ms) |
| 1, end_task | main | prior false, write `failed`, -25208 | EUI true, AXPress, boxes | `endTask` → methodNotFound. EUI stays true, AXPress stays | **4–6 frames, 94–159 ms** (animated) |
| 3, SIGTERM, 2.6 s after obs | branch | as above | EUI true, AXPress | **EUI false, AXPress gone at 27 / 27 ms**; exit status 143 | – |
| 3, SIGTERM | main | as above | EUI true, AXPress | EUI and AXPress stay | – |

At 96c6f093, end_task released at 22 / 24 ms and SIGTERM at 22 / 42 ms.

### Grace (the connection open and idle, sampled every 100 ms)

| Cell | Engine | AXPress from | Released (AXPress gone, EUI false) | Notes |
|---|---|---|---|---|
| 2, grace | branch | 1.76 s | **31.71 / 31.74 s** after obs | earlier: 31.76 / 31.73 s |
| 2, grace | main | 1.76 / 2.11 s | never (sampled for 34 s) | |
| 2, re-observation at 20 s | branch | 1.77 s | **52.01 / 52.16 s** after the first obs = 31.93 / 32.09 s after the re-observation | The re-observation (at 20.08 / 20.07 s) read prior `owned` and wrote nothing. Still on at 35 s and through 51.9 s. earlier: 52.23 / 52.03 s |

### Actions after a release

| Cell | Engine | Released at | Click at | Answer | Latency (ms) | Page |
|---|---|---|---|---|---|---|
| 4, checkbox coordinate click, no re-observation | branch | 31.61 / 31.62 s | 33.2 s | success, route 3, `elementClick {plan action, AXPress, walk [AXCheckBox], pressed hit}`, `pointerEstablish {ms 9.7 / 11.0, webAreaFound true, rehits 1}` | **2426 / 2394** | checkbox changed once |
| 4, the same | main | never | 33.2 s | success, AXPress, no `pointerEstablish` | 147 / 158 | checkbox changed once |
| 6, Reload, no observation on the connection | both | – | – | **`noScreenshotForCoordinates`**, nothing posted | 9–18 | nothing |
| 6, Reload after a grace release | branch | 31.86 s | 33.2 s | success, route 3 posted at the observation's Reload point, `pointerEstablish {ms 12.3 / 23.5, webAreaFound true, rehits 1}`, no elementClick | 165 / 131 | **no reload**: the point was stale (see below) |
| 6, Reload, the same timing | main | never | 33.2 s | success, route 3 posted, no establishment | 217 / 138 | **no reload**: the point was stale (see below) |
| 6, page plain text after a grace release | branch | 31.54 / 31.86 s | 33.2 s | `backgroundClickRefused`, `elementClick {plan synthesized, walk [AXStaticText, AXGroup, AXWebArea], walkStopped roleNotAllowed}`, `pointerEstablish {rehits 1, webAreaFound true}`, nothing posted | 28 / 23 | **counters 0** |
| 6, the same | main | never | 33.2 s | `backgroundClickRefused`, roleNotAllowed | 18 / 16 | counters 0 |

### The first click into a fresh Chrome (5)

| Cell | Engine | Answer | Latency (ms), final | Latency (ms), earlier | Page |
|---|---|---|---|---|---|
| checkbox, clicked as obs answers | branch | success, AXPress, walk [AXCheckBox] | 1919 / 1829 | 1995 / 1795 | checkbox changed once |
| checkbox | main | success, AXPress | 1970 / 1801 | 1693 / 1682 | checkbox changed once |
| textarea, line 2 col 6 (offset 30) | branch | success, route 1, `focusField`, caret placed | 1855 / 1741 | 1863 / 1783 | textarea active, caret 30, no pointer events |
| textarea | main | success, `focusField`, placed | 1827 / 1789 | 1408 / 1600 | the same |

**More on the answers:**
- TextEdit stayed frontmost in every cell.
- An element-routed AXPress shows on the page as pointerdown, mousedown, mouseup and click, once each, `isTrusted` true. That is Chrome's dispatch of AXPress, as in #282's evidence. So for a press, the discriminator is the meta's `elementClick.plan action`, not zero counters. A refused click left every counter at 0.
- A refused click after a release still takes the input's enablement step. In both reps of the plain-text cell, EUI read true again 300 ms after the refusal.

## Reload after a toolbar re-layout: the late clicks were delivered to a stale point

> **Correction (#294's spike, `docs/evidence/2026-11-06-toolbar-relayout/`).** This section first read the result below as lost
> input after 10–20 s idle, and #294 was registered for it. It is not. About 18–20 s after launch, Chrome for Testing
> re-lays out its toolbar: the Sign In pill collapses and the disabled Forward button comes back, so Reload moves from
> x 442 to 478. Every late cell here clicked the first observation's point (459, 94), which by then is on the disabled
> Forward button. Route 3 delivered the click each time, and a real HID click there misses too. The spike excludes
> idle, a held activation and throttling. #294 was closed as not-a-bug, and the stale-point guard it called for is #296.
> The table stands as measured; the bullets after it are corrected.

The Reload cells posted at Reload's centre (459, 94; the button's frame is 442–476 × 77–111) and answered success, but the page never reloaded. The diagnostics runs isolate the cause; all reloads below are counted as GET requests at the server.

| Reload clicked after obs | main | branch |
|---|---|---|
| 1 s | reloaded once / once | reloaded once / once |
| 5 s | once / once | – |
| 10 s | once / once | – |
| 20 s | **no reload** / no reload | – |
| 33 s, with no sampler running during the wait | no reload / no reload | no reload / no reload (`pointerEstablish` present) |
| 33 s, then a second click 1 s later | neither click reloaded | neither click reloaded |

- It is not caused by #292's release or #288's establishment: main never releases and misses the same way.
- It is not the probe's sampler either.
- It is time-dependent because the re-layout is: a click before it reloads, and a click after it, at the same point, lands on Forward.
- The checkbox's element route at 33 s works on both engines.

## What it shows

- **end_task releases.** The branch writes EUI back at once; Chrome drops complete mode within 12–27 ms of end_task or SIGTERM, and window moves stop animating. Main never releases.
- **The grace releases, and a re-observation pushes it back.** An open, idle connection is released about 31.7 s after its last observation. A re-observation at 20 s moves the release to about 32 s after itself. Both fall 1.5–2.1 s past the nominal 30 s, in every rep of both runs. The timer runs on `DispatchQueue.global(qos: .utility).asyncAfter` (Enablement.swift L217 at 63926945); timer coalescing at utility QoS is the likely cause, though this run does not show it.
- **An action after a release re-enables EUI and is element-routed.** The checkbox was pressed once with AXPress in 2.39–2.43 s, inside the 3 s cap of the extended re-read.
- **The first click's latency stands at 1.4–2.0 s** on both engines, as designed (no early write).
- **A never-observed Chrome cannot be clicked by coordinates.** With no screenshot on the connection the engine refuses with `noScreenshotForCoordinates`, and element tokens also come only from `get_app_state`. So the state with no page tree seen is reached only after a release, which clears `webAreaSeen`.
  - In that state the branch's click-time establishment ran (`pointerEstablish`, 10–24 ms, one re-hit).
  - Plain page text was refused with nothing posted, and the checkbox was element-routed.
  - Reload was posted but did not reload: the point was the observation's, from before Chrome's toolbar re-layout, so the click landed on the disabled Forward button (#294's spike). It does not come from the branch.
