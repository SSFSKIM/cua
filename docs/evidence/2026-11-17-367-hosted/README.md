# #367: off-screen reasons, another-Space observations and safe Raise refusals (hosted, 2026-11-17)

The final PR head `a7c2fcc3310628e32c4d3760ceb1bd9aa4a4b69a` (plugin 0.28.8) was qualified twice against matched main `136183aa196a8fd80a0dcc3fe933adff67f9cc39` on fresh disposable hosted Macs. Both repetitions reproduce Electron's missing-primary-AX state: main waits about five seconds and returns `timeoutReached`; the fix returns the named `windowOnAnotherSpace` refusal in **2.571–3.132 ms** for all six public observation calls. TextEdit instead remains AX-readable: the fix returns its tree with the placement line and omission metadata, while main returns `noCapturableWindow`.

All four final-fix other-Space Raise calls are refused with `windowOnAnotherSpace`; active Space, window memberships, bounds and frontmost app remain unchanged. All eight on-screen Raise controls succeed, with successful observations before and after and unchanged placement/frontmost. Earlier run 44122922177 demonstrates why the remedy changed: four accepted Raises on another Space did not bring the windows here. Raise is no longer offered in either remedy.

**Off-every-display remains capability-blocked, not passed:** external AX and the owned Electron app's own bounds setter keep 24–40 pixels visible on this hosted image. No true off-display Raise was attempted.

## Runs and reproducibility

Workflow `probe-367`, branch `probe/367-live`, uses disposable GitHub-hosted `macos-latest` runners, owned TextEdit documents and Electron 44.9.0 fixture processes/profiles. Each job builds separate exact-pin main/fix engines in runner worktrees and checks both source trees remain unmodified. Native Electron code is not patched; only the owned fixture JavaScript has the documented one-shot bounds setup control, followed by ad-hoc re-signing. Final targeted runs do not request an off-display position; the owned control only restores visible geometry after cleanup, never performs Raise. No local GUI, Mac mini, owner profile, secrets store or TCC interaction is used.

| Run | Kit | Main / fix | Evidence and status |
| --- | --- | --- | --- |
| [44101305953](https://github.com/SSFSKIM/cua/actions/runs/44101305953) | 5bc0c60b | 15acf09b / 2b7804bd | Initial AX clamp / ineffective CGEvent shortcut setup; no special Raise scored |
| [44106077029](https://github.com/SSFSKIM/cua/actions/runs/44106077029) | d8a30f33 | 15acf09b / 2b7804bd | Distinct AX constructions plus Finder/MC attempts remained setup-blocked |
| [44111743279](https://github.com/SSFSKIM/cua/actions/runs/44111743279) | 5bb43cdf | 15acf09b / 2b7804bd | Owned setBounds also clamps; System Events switches, but AX-dependent oracle prevents valid scoring |
| [44122922177](https://github.com/SSFSKIM/cua/actions/runs/44122922177) | 16753e19 | 15acf09b / 2b7804bd | Complete original-plan comparison; four accepted other-Space Raises are placement-inert |
| [44133515588](https://github.com/SSFSKIM/cua/actions/runs/44133515588) | c4f67f80 | 15acf09b / d7784552 | Interim ruling-782 run with on-screen Raise control before the Space cell; refusal verified, but missing-primary-AX case did not reproduce |
| [44135587845](https://github.com/SSFSKIM/cua/actions/runs/44135587845) | d3faa0f3 | 136183aa / a7c2fcc3 | Final-head repetition 1, control after Space cell; all assertions pass |
| [44136447268](https://github.com/SSFSKIM/cua/actions/runs/44136447268) | d3faa0f3 | 136183aa / a7c2fcc3 | Final-head repetition 2 on a fresh hosted job; all assertions pass |

The first three workflows executed successfully but did not qualify their special fixtures. Their original records are retained, not converted into product passes. The registration commit `5bc0c60b` was the sole coordinator-authorized commit without `[skip ci]`; ordinary CI was verified push-restricted to `ci/**`. Every other probe/evidence commit retains `[skip ci]`.

The per-run directories, the reader and the kit named below live on the probe branch, not here: [probe/367-live at f69cd90a](https://github.com/SSFSKIM/cua/tree/f69cd90a46c2ff9812999431e0fd7fa2d139abc1/docs/evidence/2026-11-17-367-hosted) (about 9.5 MB, with screenshots). This README is the copy that ships with the change.

Artifact name is `probe-367-live`. Per-run directories retain README-ready `tables.txt`, structured summaries, projected independent evidence, runner/fixture metadata and owned screenshots; profiles are never uploaded. Full original `results.json`, `oracle-events.json`, configuration and per-call records remain in each run's artifact. Projections replace repeated native AX nodes/menu with node counts/roles and omit private fullscreen-layout internals; rendered text and independent own-window CG/AX/Space evidence remain.

Run the trusted reader against downloaded artifacts as data, from the checkout rather than an artifact directory:

```sh
python3 -I scripts/probe-367/summarize-782.py /absolute/artifacts /absolute/output RUN_URL
```

## What is judged

A genuine other-Space fixture requires positive pinned window Space memberships excluding the known active/display-current Space, plus exclusion from a separately read on-screen-only list. The oracle retains separate `.optionAll` and exact `.optionIncludingWindow` dictionaries/flags and independently reads NSWorkspace frontmost and frames. CG bounds are explicitly distinguished from unknown AX geometry; the known window number remains observable even when AXWindows becomes empty. Stable final observations have both CG flags false. An early transitional flag/list disagreement is retained, not treated as a persistent product-predicate defect.

All measured Raises go through the actual public `performSecondaryAction(index, "Raise")`, once, using a valid observed window index. Failed observations may reset native lineage: the kit returns by explicit Space-ID switching, obtains a successful visible public observation, switches away again, and re-proves placement before Raise. The on-screen control is **after** the other-Space cell in the two final repetitions, with another fresh public observation for its index. The earlier control-before run is labelled separately, not pooled with them.

The refusal check requires the named native error, and independent active Space, membership, frame and frontmost equality. Missing memberships/frames do not count as equality. Samples bracket the call with a 1.6-second post-action endpoint; they do not provide a continuous trace of transient Space changes or claim that unchanged endpoints alone prove no OS event was sent. Product source and unit tests cover the pre-send guard. Direct elapsed times use `performance.now()` around each awaited public call, excluding report serialization after the call. Individual values follow; two repetitions do not establish a latency distribution.

## Original live-check plan: both heads

These original full-plan rows refer to [44122922177](https://github.com/SSFSKIM/cua/actions/runs/44122922177) (main `15acf09b`, fix `2b7804bd`), not the later refusal head. Only other-Space cells and on-screen controls were rerun at the final PR head.

| Step | Main | Original fix | Final-head follow-up |
| --- | --- | --- | --- |
| 1 owned on screen | TextEdit/Electron observe and capture 900×500 | Initial text and JPEG bytes/lengths/dimensions identical to main; 21,989 B / 25,145 B | Successful fresh on-screen observations and Raise controls, twice per app/head |
| 2 off every display | AX setters retain 24–40 px visible; owned Electron setBounds also clamps | Same capability limit; no zero-overlap observation or Raise scored | Not rerun; no live off-display recovery claim |
| 3 partly off | Both apps at (-790,200,900,500): observations and screenshots succeed; no placement marker | Same; 110 px overlap, screenshots returned | Not rerun |
| 4 another Space | TextEdit: noCapturableWindow; Electron: approximately5s timeoutReached | TextEdit: placement line/meta and named screenshot error; Electron unchanged | New refusal/observation results below |
| 5 hidden app | Both observations fail noCapturableWindow | Same as main; no placement claim | Not rerun |
| 6 back on screen | Strict restoration pins fail: TextEdit text and both JPEG bytes/lengths differ; dimensions return | Same failure pattern; Electron text is identical | On-screen API controls rerun, not strict restoration-byte identity |
| 7 cost (20/app/head) | Walk p50 TextEdit22.088ms / Electron28.176ms | Walk p50 TextEdit22.648ms / Electron21.805ms | Not a new performance qualification |

TextEdit's disabled vertical scrollbar changes `0.1851851791143417 → 1` after the fullscreen round trip on both heads. Preserve that strict step-6 failure; it is not a fix-only regression. Original independent per-window CG query p50s span0.163–0.392ms. Native walk timing excludes the placement read, so those observations do not isolate its overhead.

## Raise: accepted no-op, then explicit refusal

In [44122922177](https://github.com/SSFSKIM/cua/actions/runs/44122922177), all four public Raises returned success but active Space stayed1, window memberships stayed[10]/[15]/[20]/[25], bounds stayed(0,0,1024,768), Finder stayed frontmost and the windows remained absent from the on-screen-only list. This counterexample invalidated the old “Its Raise action can bring it here” remedy. True off-display Raise was not measured.

| Run / head / app | Public Raise answer; time | Active Space | Window Spaces | CG frame | Frontmost |
| --- | --- | --- | --- | --- | --- |
| [44135587845](https://github.com/SSFSKIM/cua/actions/runs/44135587845) / main / textedit | success; 85.281 ms | 1 → 1 | [10] → [10] | (0, 0, 1024, 768) (unchanged) | com.apple.finder (unchanged) |
| [44135587845](https://github.com/SSFSKIM/cua/actions/runs/44135587845) / main / electron | success; 152.887 ms | 1 → 1 | [15] → [15] | (0, 0, 1024, 768) (unchanged) | com.apple.finder (unchanged) |
| [44135587845](https://github.com/SSFSKIM/cua/actions/runs/44135587845) / fix / textedit | windowOnAnotherSpace; 3.945 ms | 1 → 1 | [20] → [20] | (0, 0, 1024, 768) (unchanged) | com.apple.finder (unchanged) |
| [44135587845](https://github.com/SSFSKIM/cua/actions/runs/44135587845) / fix / electron | windowOnAnotherSpace; 2.784 ms | 1 → 1 | [25] → [25] | (0, 0, 1024, 768) (unchanged) | com.apple.finder (unchanged) |
| [44136447268](https://github.com/SSFSKIM/cua/actions/runs/44136447268) / main / textedit | success; 94.396 ms | 1 → 1 | [10] → [10] | (0, 0, 1024, 768) (unchanged) | com.apple.finder (unchanged) |
| [44136447268](https://github.com/SSFSKIM/cua/actions/runs/44136447268) / main / electron | success; 109.070 ms | 1 → 1 | [15] → [15] | (0, 0, 1024, 768) (unchanged) | com.apple.finder (unchanged) |
| [44136447268](https://github.com/SSFSKIM/cua/actions/runs/44136447268) / fix / textedit | windowOnAnotherSpace; 3.361 ms | 1 → 1 | [20] → [20] | (0, 0, 1024, 768) (unchanged) | com.apple.finder (unchanged) |
| [44136447268](https://github.com/SSFSKIM/cua/actions/runs/44136447268) / fix / electron | windowOnAnotherSpace; 2.900 ms | 1 → 1 | [25] → [25] | (0, 0, 1024, 768) (unchanged) | com.apple.finder (unchanged) |

The final fix refuses **4/4** other-Space Raises; matched main accepts **4/4** and leaves placement unchanged. No ordinary non-fullscreen second-desktop population is claimed beyond the actual per-run records.

## Final-head public observations

| Run / app | Call | Main answer; elapsed | Fix answer; elapsed |
| --- | --- | --- | --- |
| [44135587845](https://github.com/SSFSKIM/cua/actions/runs/44135587845) / textedit | getApp | noCapturableWindow; 11.709 ms | App + placement line; 11.580 ms |
| [44135587845](https://github.com/SSFSKIM/cua/actions/runs/44135587845) / textedit | getAXState | noCapturableWindow; 10.684 ms | placement text; 11.540 ms |
| [44135587845](https://github.com/SSFSKIM/cua/actions/runs/44135587845) / textedit | getScreenshot | noCapturableWindow; 11.951 ms | Error (named screenshot reason); 10.364 ms |
| [44135587845](https://github.com/SSFSKIM/cua/actions/runs/44135587845) / electron | getApp | timeoutReached; 5074.928 ms | windowOnAnotherSpace; 3.132 ms |
| [44135587845](https://github.com/SSFSKIM/cua/actions/runs/44135587845) / electron | getAXState | timeoutReached; 5015.229 ms | windowOnAnotherSpace; 3.107 ms |
| [44135587845](https://github.com/SSFSKIM/cua/actions/runs/44135587845) / electron | getScreenshot | timeoutReached; 5044.862 ms | windowOnAnotherSpace; 2.814 ms |
| [44136447268](https://github.com/SSFSKIM/cua/actions/runs/44136447268) / textedit | getApp | noCapturableWindow; 9.872 ms | App + placement line; 15.030 ms |
| [44136447268](https://github.com/SSFSKIM/cua/actions/runs/44136447268) / textedit | getAXState | noCapturableWindow; 16.542 ms | placement text; 11.845 ms |
| [44136447268](https://github.com/SSFSKIM/cua/actions/runs/44136447268) / textedit | getScreenshot | noCapturableWindow; 9.059 ms | Error (named screenshot reason); 10.722 ms |
| [44136447268](https://github.com/SSFSKIM/cua/actions/runs/44136447268) / electron | getApp | timeoutReached; 5018.647 ms | windowOnAnotherSpace; 2.743 ms |
| [44136447268](https://github.com/SSFSKIM/cua/actions/runs/44136447268) / electron | getAXState | timeoutReached; 5074.572 ms | windowOnAnotherSpace; 2.746 ms |
| [44136447268](https://github.com/SSFSKIM/cua/actions/runs/44136447268) / electron | getScreenshot | timeoutReached; 5019.580 ms | windowOnAnotherSpace; 2.571 ms |

TextEdit getApp/getAXState returns the placement line and `cua/screenshotOmitted=windowOnAnotherSpace` in both final repetitions. The exact line is:

> [window on another Space: the window is not on the current Space, so it may show no content and has no screenshot. Ask the user to bring it here or switch to its Space.]

Its screenshot method throws a plain facade `Error` (no native error name), with omission metadata and exact text:

> Screenshot unavailable for /System/Applications/TextEdit.app: the window is on another Space. Ask the user to bring it here or switch to its Space.

The native `windowOnAnotherSpace` error is a `SkyComputerUseError`. For Electron observations and Electron Raise it reads:

> Computer Use server error -10005: The cua Electron Fixture window is on another Space. Ask the user to bring it here or switch to its Space.

TextEdit Raise uses the same sentence with `TextEdit` in place of `cua Electron Fixture`. Main's native error texts are `Computer Use server error -10005: No capturable window found: TextEdit` and, for the missing-primary-window Electron state, `Computer Use server error -10005: timeoutReached`. No empty screenshot is returned in those error cells. Full successful state text and every exact error are retained in each `ruling-782.json`.

## On-screen controls

| Run / head / app | Observation before | Accepted Raise | Observation after | Independent assertions |
| --- | --- | --- | --- | --- |
| [44135587845](https://github.com/SSFSKIM/cua/actions/runs/44135587845) / main / textedit | 388.958 ms | 110.799 ms | 435.431 ms | all pass; placement/frontmost unchanged |
| [44135587845](https://github.com/SSFSKIM/cua/actions/runs/44135587845) / main / electron | 366.915 ms | 128.510 ms | 352.285 ms | all pass; placement/frontmost unchanged |
| [44135587845](https://github.com/SSFSKIM/cua/actions/runs/44135587845) / fix / textedit | 39.096 ms | 147.146 ms | 340.065 ms | all pass; placement/frontmost unchanged |
| [44135587845](https://github.com/SSFSKIM/cua/actions/runs/44135587845) / fix / electron | 36.892 ms | 132.055 ms | 351.086 ms | all pass; placement/frontmost unchanged |
| [44136447268](https://github.com/SSFSKIM/cua/actions/runs/44136447268) / main / textedit | 346.173 ms | 157.808 ms | 337.619 ms | all pass; placement/frontmost unchanged |
| [44136447268](https://github.com/SSFSKIM/cua/actions/runs/44136447268) / main / electron | 289.086 ms | 89.268 ms | 314.002 ms | all pass; placement/frontmost unchanged |
| [44136447268](https://github.com/SSFSKIM/cua/actions/runs/44136447268) / fix / textedit | 24.707 ms | 122.944 ms | 430.759 ms | all pass; placement/frontmost unchanged |
| [44136447268](https://github.com/SSFSKIM/cua/actions/runs/44136447268) / fix / electron | 25.138 ms | 139.198 ms | 350.614 ms | all pass; placement/frontmost unchanged |

All8/8 on-screen Raise controls and16/16 surrounding observations succeed. These show that the refusal is not applied to an ordinary on-screen window. They do not claim that normal z-order raising is prohibited or that all screenshot encodings are deterministic.

## Electron missing-primary-AX state: how far verified

The earlier [44122922177](https://github.com/SSFSKIM/cua/actions/runs/44122922177) records the old failure on both then-matched heads: getApp/getAXState/getScreenshot each returned native `timeoutReached` after approximately5s. Its adjacent-oracle timing brackets and diagnostic limits remain in `run-44122922177/electron-timeouts.json`. The engine, not the kit, ended those calls: client budget120s plus2s grace, native launch/reopen/primary-window wait5s. Capture uses10s and `screenCaptureFailed`, so that error is pre-capture window acquisition/reopen. The old error has no phase trace distinguishing NSWorkspace reopen completion from its following primary-window wait.

The interim [44133515588](https://github.com/SSFSKIM/cua/actions/runs/44133515588) did not reproduce the missing-primary-window branch: main Electron returned fast noCapturableWindow and the fix returned AX-readable placement observations. Its on-screen Raise control preceded the Space cell. That run is not evidence for the new absence-refusal path. The two final repetitions moved the control after the Space cell and **both reproduced the conditional case**: six main observation calls took5015.229–5074.928ms and returned timeoutReached; all six corresponding fix calls returned named windowOnAnotherSpace in2.571–3.132ms. This is live evidence, not unit coverage alone. It does not establish that every Electron window on another Space loses its accessible primary window.

AXWindows enumeration is empty in these cells, but the list alone is not the condition: the engine also considers AXFocusedWindow/AXMainWindow. The named observation error proves the fix's absence-refusal path executed; AX-readable TextEdit observations remain successful despite an empty AXWindows enumeration. Source tests additionally cover positive absence refusal before reopening, slow-opening/current-Space/hidden/unknown cases and the mixed-window veto, plus Raise refusal versus on-screen/off-display pass-through: [PlacementTests.swift](https://github.com/SSFSKIM/cua/blob/a7c2fcc3310628e32c4d3760ceb1bd9aa4a4b69a/native/engine/Tests/EngineTests/PlacementTests.swift#L142) and [LogicTests.swift](https://github.com/SSFSKIM/cua/blob/a7c2fcc3310628e32c4d3760ceb1bd9aa4a4b69a/native/engine/Tests/EngineTests/LogicTests.swift#L288). This lane ran24 focused kit tests and source builds, not a separate Swift-test qualification.

## Off-display capability limit and current remedies

Every off-display setup was rejected unless the actual frame had zero intersection with every NSScreen. AXPosition(-5000,200) returned success but acceptedx=-860 at width900 (40px overlap). Requesting width300 there producedwidth884 (24px overlap); a bottom move also clamped. The approved owned Electron setBounds route acknowledged acceptedx=-860, not requested-5000. No partly visible window was scored as off-display, and no off-display Raise was issued. This bounds these tested APIs on the hosted image, not every possible app/display-topology failure. No further placement routes were tried after the coordinator closed the cell.

Ruling782 therefore drops Raise from both remedies. Current source says “Ask the user to move it onto a display” for off-screen and “Ask the user to bring it here or switch to its Space” for another Space. The first is headlessly covered but not live-recovered in this lane; the second is live-observed and its Raise guard is live-refused. Old wording and all original source pins remain in the historical per-run evidence, not silently rewritten.

## Scope limits

- The live path is the real public facade/trusted service over unmodified source-built native engines, using the existing nativePipe bridge. It is not an MCP-host/sandbox qualification.
- Final repetitions cover the owned TextEdit/Electron fixture state, not all apps, Spaces topologies or display changes.
- Endpoint equality does not rule out unobserved transient activity between samples.
- Exact restoration-byte identity failed on both original arms and was not used to force the later results green.
- Final-head other-Space/control coverage is complete for the two requested repetitions. Off-display recovery remains explicitly unqualified.
