# #282's live A/B: a background click into a Chrome page, on a GitHub-hosted macOS runner

**This is #282's live proof** (the design session's ruling, 1ea561bc bbaa0eba). It ran on a hosted runner, with no owner and no MacBook slot.

- **The probe:** the `probe/282-hosted` branch (`scripts/probe-282/`, `.github/workflows/probe-282.yml`). It stays off main.
- **The final run:** https://github.com/SSFSKIM/cua/actions/runs/42137289452. The fix is at d88fe34a; main is at 739346e5.
- **The records:** `rep1/results.json` and `rep2/results.json`, one runner each. Each carries the config, every cell's full engine answers, the page counters, the hits and the geometry.
- **The reps agree in every cell.**

**The measured config:**
- GitHub's macos26 image 20261026.0455.2, macOS 26.6.2 (25G83), a 1024 x 768 display.
- Chrome for Testing 156.0.8078.47 (principal class `BrowserCrApplication`).
- An earlier run on c768d2bb also covered 26.7.2 (25G332) with Chrome for Testing 156.0.8078.80.
- Stable Chrome on the owner's Mac is unmeasured.

**The grants.** The runner image grants Accessibility, PostEvent and Screen Recording to `/bin/bash`. An unbundled debug `cua-engine`, run as a child of the job's shell (bash → node → cua-engine), inherits them. Its status read: accessibility, canPostHid, screenRecording and inputMonitoring all true.

**The setup.**
- Each cell gets a fresh Chrome for Testing, a fresh engine and a fresh connection.
- The page is the probe's counters page: pointerdown, mousedown, mouseup and click on the document, textarea focus, a checkbox, and an Apply button with its own counter.
- TextEdit sits frontmost beside Chrome.
- "After obs" is the time from the end of the engine's first observation of Chrome to the click.

## Results (rep1 / rep2)

| Cell | After obs | Engine answer | elementClick | Latency (ms) | Page |
|---|---|---|---|---|---|
| main, textarea | 0.93 / 1.04 s | success, route 3 | none | 129 / 1153 | **nothing**: pointer 0/0/0/0, no focus. The bug |
| dedicated, textarea | 0.87 / 0.90 s | success, route 3, inert click early | none | 131 / 142 | pointer 1/1/1/1, textarea focused, TextEdit frontmost |
| shared, checkbox | 0.90 s | success, AXPress | walk [AXCheckBox], pressed hit | 884 / 967 | checkbox changed once |
| shared, checkbox, clicked at once | 0.09 / 0.10 s | success, AXPress | walk [AXCheckBox], pressed hit | 1778 / 1544 | checkbox changed once |
| shared, button | 0.91 / 0.85 s | success, AXPress | walk [AXStaticText, AXButton], pressed ancestor | 840 / 846 | Apply once |
| shared, textarea | 0.90 / 0.92 s | `backgroundClickRefused` | walk [AXTextArea], walkStopped editable | 11 / 20 | nothing at all, not even a focus or blur |
| shared, toolbar Reload | 0.84 / 0.97 s | success, route 3 | none | 143 / 129 | the page reloaded once |
| shared, ⌘L then checkbox | 0.85 / 0.90 s | success, AXPress | walk [AXCheckBox] | 856 / 561 | checkbox changed once |
| shared, ⌘L then button | 0.85 / 0.98 s | success, AXPress | walk [AXStaticText, AXButton], ancestor | 806 / 384 | Apply once |
| shared, ⌘L then textarea | 0.86 / 0.90 s | `backgroundClickRefused` | walkStopped editable | 129 / 325 | nothing from the click |
| shared, checkbox, after 3.4 s | 3.38 s | success, AXPress | walk [AXCheckBox] | 181 / 131 | checkbox changed once |
| shared, button, after 3.4 s | 3.35 s | success, AXPress | walk [AXStaticText, AXButton], ancestor | 105 / 111 | Apply once |
| shared, textarea, after 3.4 s | 3.35 / 3.40 s | `backgroundClickRefused` | walkStopped editable | 6 / 10 | nothing |

**Geometry.** Chrome's window frame (400, 31, 620 × 679) and its AXActivationPoint (−1, 769) read the same before and after a fresh subtype 1, and after subtype 2. So the activation-point plan can be read before subtype 1.

## What it shows

- **On main, the click is lost:** the engine reports success, and the page receives nothing.
- **Dedicated mode delivers the click exactly once.** TextEdit stays frontmost: the window became key but was not raised above TextEdit.
- **Shared mode never posts a mouse event into the page.**
  - An allowlisted control is pressed through its accessibility action. A button's hit is its AXStaticText label, and the walk goes up to the button.
  - The control changes exactly once. The pointer counters read 1/1/1/1 on these presses because Chrome plays its own trusted pointer sequence for AXPress; cua posts nothing.
  - A text area is refused, with nothing posted.
  - Chrome's toolbar keeps delivering.
- **The bounded re-read.**
  - Chrome for Testing refuses the engine's AXManualAccessibility write as not implemented: `enablementWrite: failed`, `enablementWriteError: -25208`, on 15 of 15 observations in each rep.
  - It reaches complete accessibility mode anyway, about 1.5 to 1.7 s after the first observation (the `obs-timeline` cell). Until then its page controls advertise no AXPress.
  - The engine treats the process as fresh for 10 s after that first observation. A click inside that window waits for the action (up to 2 s), and its answer lands about 1.6 to 1.9 s after the observation.
  - A click after the action exists answers in 105 to 181 ms.

## Earlier runs on the way

These runs found the fixes in 8bc549a1 through d88fe34a:
- **42123497534 and 42124119631 (8e859095).** The hit-test asked the window element, which answers −25201, so shared mode posted.
- **42130746324 (c768d2bb).** AXPress was missing before complete mode; a textarea's AXPress succeeded with no effect; the ⌘L cells raced.
- **42131623237.** Enablement, not activation, brings AXPress.
- **42132326351.** A button's hit is its label.
- **42134748488 (1c8f2229).** The failed write kept the re-read off.
