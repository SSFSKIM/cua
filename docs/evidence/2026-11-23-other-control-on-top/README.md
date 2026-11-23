# #442: hosted macOS evidence for the stale-point guard's check of the control on top

All runs here are on GitHub-hosted macOS, image 20261117.0516.1, with Chrome for Testing 157.0.8103.78, Safari 27.2 and Electron 44.4.5 (Chromium 152.0.7977.130), in the background presentation. Each engine was built unmodified from an exact SHA. The kit is `probe/442-measure` (`scripts/probe-433/`: `cells.mjs`, `page.mjs`, `host.swift`, `tables.mjs`, `bar442.mjs`, `cmp442.mjs`), run through workflow `probe-442-measure.yml` in mode `qualify`, with main and fix interleaved, 10 rows per head per unit. Every table below comes from `scripts/probe-433/README.md` on that branch (`67d64eba`):
- §"#442 qual", for the cells;
- §"Counted on c04efb4e (pre-merge)";
- §"Counted on the merged head", which also covers #453's delivering cells.

Qualified by ruling 1101. The final head is `f0547af1`: the merged head `8feea998` plus main `da7585c3` (#489, the Linux engine). That merge changed the version only, and nothing under `native/engine`.

## What changed

On main, #433's check vouches for the recorded controls beneath an inert overlay, and #296 keeps a non-interactive hit without asking which control it lies in. Neither can see stacking.

The kit's `slideover` cell shows the gap. A veil lies over link A. Button B, from another row, slides over A by a CSS transform, and A is neither removed nor changed. Main still kept the click:
- on Electron it landed on B (20/20 cold, and 10/10 warm at the text point);
- on CfT the element route pressed the veil, and nothing happened.

A corrected AX hit is the page's own hit test: it agreed with `elementFromPoint` in 1,694 of 1,695 rows. Chromium's first answer at a new point is approximate, and it corrects 25–61 ms later with no signal. Safari's first answer is already correct.

The fix (`fix/442-other-control-on-top`; rulings 1073, 1078 and the last review wave) acts only on two keep paths: #433's keep through an inert layer, and the `nonInteractiveHit` keep. Every other verdict is main's.

**The rule as shipped**:
- **Where:** `StalePoint.swift:1104` `stalePointVerdict` runs main's verdict, #443's `controlGone` and #433's check. It then calls `otherControlOnTopVerdict` (`:1180`).
- **The corrected hit:**
  - On a Chromium-family app, the point is hit-tested again after 80 ms (`stalePointCorrectionMs`, `:443`). Chromium-family means `PageEngine.chromium`, by the app's Info.plist principal class (`Engine.stalePointCorrectsLate`, `:2165`).
  - The re-hit is a `WindowHit`. It goes first through #452's window check (`appWindowVerdict` `:1731`, via `stalePointWindowCheck` `:2169`; applied at `:1192`): a window of the app's that opened over the point during the wait refuses `appWindowOverPoint`.
  - The click's guard (`Input.swift:586`), the drag's guard (`ScrollDrag.swift:187`) and the element route's final recheck all take this path.
  - Safari and other engines judge the action's own first hit, with no wait.
  - The verdict keeps the action's own hit.
  - The meta's `stalePoint.hitCorrection` is `same`, `changed` or `none` (`:447`, wired at `:1817`). When the delayed hit supplies the window refusal, `hitMs` reports that hit-test's own time (`correctedHitMs`, `:572`).
- **The control:**
  - The control judged is the hit's nearest acting control (`firstActing`, `:1314`, #443's `liveControl` walk). An unread role, unread actions or an unread parent end the walk as inconclusive, and the verdict is kept.
  - Where #433's check ran, a recorded candidate beneath the layer that the hit names is judged by #433's test (`:1204`). If it passes, it becomes the control beneath; if it fails, the rule below decides. It is never refused for #433's own reason.
- **Refusal:** `otherControlOnTop` (`:504`) refuses only a known control that moved over the target (`movedOverPoint`, `:1243`). All of these must hold:
  - the record holds it by handle as a control, at placed frames (never `CGRect.zero`), each of them away from the point;
  - #305's `recordedHitAtPoint` does not take it at the point, by its own frame or its parent's padding;
  - it is not the node, the node's recorded control (by handle, never a live parent), or a control whose recorded content was shown at the point;
  - the node's control is known (not `controlUnknown`).
- **The answer:** `screenChangedSinceScreenshot`, with meta `stalePoint.reason: otherControlOnTop` and `controlRole` set to the role of the control on top (`:1816`). The sentence is `otherControlOnTopRefusal` (`:2090`). The model-facing docs are unchanged: "has given way to another control" already covers it.
- **#453's row press** (`OverlayClick.swift:168`) never takes an `appWindowOverPoint` that the delayed re-hit decided.
- **Fake tests:** `OtherControlOnTopTests` (`StalePointTests.swift:4863`, 15 tests).

## Runs

Counted on `c04efb4e`, before the merge (main `5580ac20` against fix `c04efb4e`):

| Batch | Run | Kit | Hits | Rows per lane |
|---|---|---|---|---|
| QA1: refuse cells, siblingstack, decomove, popupwait, ruling 1080's rows | [45065060085](https://github.com/SSFSKIM/cua/actions/runs/45065060085) | `2a7d472d` | cold | 260 (Safari 240) |
| QA2: the review's and ruling 1079's shapes | [45068426516](https://github.com/SSFSKIM/cua/actions/runs/45068426516) | `4fe905a8` | cold | 340 |
| QAw: refuse cells, siblingstack, shapes | [45072260919](https://github.com/SSFSKIM/cua/actions/runs/45072260919) | `4fe905a8` | warm | 460 |
| QB: #433's and #443's overlay cells | [45077727351](https://github.com/SSFSKIM/cua/actions/runs/45077727351) | `4fe905a8` | cold | 460 |
| QBw: the overlay keeps | [45082411152](https://github.com/SSFSKIM/cua/actions/runs/45082411152) | `4fe905a8` | warm | 320 |
| QC1: keep cells | [45086022030](https://github.com/SSFSKIM/cua/actions/runs/45086022030) | `4fe905a8` | cold | 300 |
| QC2: #340's cells, #431's twins | [45089459844](https://github.com/SSFSKIM/cua/actions/runs/45089459844) | `4fe905a8` | cold | 400 |

Counted on the merged head (main `33c8dd09` against fix `8feea998`; rulings 1085 and 1086). These are the same cells, repetitions and hits as above. `cmp442.mjs` compared each unit's tally against the `c04efb4e` run that held it:

| Batch | Run | Kit | Hits | Against `c04efb4e` |
|---|---|---|---|---|
| M1 (as QA1) | [45094703164](https://github.com/SSFSKIM/cua/actions/runs/45094703164) | `4fe905a8` | cold | fix 38 units, 1 differs (`popupwait`, Electron, timing-dependent); main differs on the same unit |
| Mw (as QAw) | [45097985214](https://github.com/SSFSKIM/cua/actions/runs/45097985214) | `76851a3f` | warm | fix 69 units, 0 differ; main 0 |
| M2 (as QA2) | [45103752835](https://github.com/SSFSKIM/cua/actions/runs/45103752835) | `76851a3f` | cold | fix 51, 0; main 0 |
| MB (as QB) | [45108998758](https://github.com/SSFSKIM/cua/actions/runs/45108998758) | `76851a3f` | cold | fix 69, 0; main 0 |
| MBw (as QBw) | [45114265526](https://github.com/SSFSKIM/cua/actions/runs/45114265526) | `76851a3f` | warm | fix 48, 0; main 0 |
| MC1 (as QC1) | [45118345837](https://github.com/SSFSKIM/cua/actions/runs/45118345837) | `76851a3f` | cold | fix 45, 0; main 1 row fewer (`like/link` Electron, a setup row) |
| MC2 (as QC2) | [45122285177](https://github.com/SSFSKIM/cua/actions/runs/45122285177) | `76851a3f` | cold | fix 60, 0; main 0 |

#453's delivering cells on `8feea998` (`probe/453-measure`, kit `qual453`): [45108028372](https://github.com/SSFSKIM/cua/actions/runs/45108028372) and [45128593886](https://github.com/SSFSKIM/cua/actions/runs/45128593886).

## The bar (fix against main)

| Line | `c04efb4e` against `5580ac20` | `8feea998` against `33c8dd09` |
|---|---|---|
| `slideover`, CfT, cold / warm | **20/20** `otherControlOnTop` / **20/20** refused (text point `otherControlOnTop`, link point `interactiveHit`) | **20/20** / **20/20**, the same reasons |
| `slideover`, Electron, cold / warm | **20/20** `otherControlOnTop` / **20/20** refused, as CfT | **20/20** / **20/20** |
| `slideover`, Safari, cold / warm | 20/20 `interactiveHit` / 20/20 `interactiveHit`, as main | the same |
| `slideover` on main | reached nothing on CfT cold; landed on B on Electron cold (20/20) and warm text (10/10); refused elsewhere | the same |
| Keep cells and reviewer shapes against main, row for row, reason included: #433's and #443's overlay cells, the keep cells, #340's cells, #431's twins, and the shapes `overflowlink`, `deepfront`, `rescrim`, `scrimhidden`, `widen`, `shrinkfront`, `textoutside`, `contentsfront`, `parentpad` | **0 differ**; false refusals **0**; no fix row refused `otherControlOnTop` outside the refuse cells; no fix row reached a control its main row did not | **0 differ**; every unit's fix tally equals `c04efb4e`'s, except `popupwait` (report-only); false refusals **0** |
| `siblingstack` against main | as main, row for row, every lane, cold and warm (the declared limit) | the same |
| Ruling 1080's relabel rows (`relabelfront`, `relabelfirst`) | as main in both orders on every lane: CfT kept `sameElement` (reached nothing), Electron kept `sameElement` (landed on A), Safari `newElementOverPoint` (text) / `interactiveHit` (link); no lane showed `relabelled` | the same |
| `decomove` | CfT 20/20 and Electron 20/20 `controlGone`, as main; Safari `nodeGone` on both heads | the same, against main `33c8dd09` |
| #453's delivering cells | not applicable | omnibox, permission allow, permission block and popover delivered, confirmed and taken: **22/22** (45108028372) and **40/40** (45128593886); shared-mode frontmost, key window and raised **0**; wrong row, false ok and reached the window beneath **0** |

The paired gates fail only where they fail on main's own baseline:
- `overlayKept`: main's own unlanded rows, the same number on both heads. When cold, CfT's `overcontrol` and `overlaprow/link` reach nothing; Safari refuses `overlapinto` and `overlaprow`.
- `noWrongTarget`: cells both heads lose alike. These are `siblingstack` (the declared limit), `deepfront` and `contentsfront` (F is on top in the screenshot), and `veilinto/link` (below).

## The 80 ms margin

The kit's warm sequences ran on both heads, 780 rows per Chromium lane per set. They corrected at a median of **29 ms** (CfT) and **31 ms** (Electron) in both sets. Three rows corrected after 80 ms, out of **3,120**:
- 95 ms and 82 ms on CfT (`c04efb4e` set);
- 93 ms on Electron (merged set).

The fix's `hitCorrection` on Chromium:

| Set | Hits | CfT changed / same / none | Electron changed / same / none |
|---|---|---|---|
| `c04efb4e` | cold | 283 / 50 / 5 | 287 / 50 / 1 |
| `8feea998` | cold | 287 / 50 / 1 | 283 / 50 / 5 |
| both | warm | same on every row (160) | same on every row (150) |

`same` falls only in `scrim`, `scrimhidden` and `overlaprow/text`, where the first answer is already right: the scrim, or the target's own text. `none` falls only in `popupwait`. Warm rows read `same` because the kit's sequence had already corrected Chromium's cache.

## Cost

`stalePoint.ms`, p50 / p95, all seven runs of each set:

| Lane | main `5580ac20` | fix `c04efb4e` | main `33c8dd09` | fix `8feea998` |
|---|---|---|---|---|
| CfT | 5.0 / 20.1 | 13.8 / 269.6 | 5.0 / 19.0 | 14.1 / 271.4 |
| Electron | 2.8 / 9.7 | 6.9 / 165.8 | 3.0 / 9.2 | 6.3 / 164.6 |
| Safari | 3.5 / 10.0 | 3.6 / 10.4 | 3.3 / 10.6 | 3.7 / 10.1 |

On the cells where the check runs (QA1), the fix's p50 is **116 ms** on CfT and **137 ms** on Electron: the 80 ms wait plus the second hit-test. Off those cells it is as main, within 1 ms on QC1 and QC2. Safari never waits.

## Shapes covered only by fakes

A page cannot produce these, so `OtherControlOnTopTests` covers them, and each fails against the rule without its fix:
- **`controlUnknown`:** a wrapper whose actions did not read at the observation. The record cannot say whose control the node was, so the click is kept.
- **A parent read that fails:** the overflowing link whose text's parent does not read at click time. The kit's `overflowlink` builds only the overflow.
- **An unplaced frame (`CGRect.zero`):** a button recorded with no placement. Every browser listed `contentsfront`'s F with a frame of its own (CfT and Electron 113×56, Safari 53×24), so the condition could not be built on a page.

## popupwait (report-only)

The page opens a popup over the point 0–150 ms after the harness's command (CfT and Electron, link point). The fix's `appWindowOverPoint` on the delayed hit:

| Set | CfT | Electron |
|---|---|---|
| `c04efb4e` | 1 row (delay 20 ms, `hitMs` 1.3) | 1 row (20 ms, `hitMs` 4.8) |
| `8feea998` | 1 row (20 ms, `hitMs` 63.9) | 5 rows (20, 40 and 60 ms; `hitMs` 1.8–4.3) |

At a 0 ms delay, both heads answered either no guard record or #316's `newWindow`. On the `c04efb4e` set, Electron main landed through the popup at 60–150 ms (4 rows) where the fix reached nothing. The cell is timing-dependent, which is why it is the one unit that differs between the sets.

## Limits

- **Stacked recorded siblings.** `siblingstack`: two recorded controls are stacked at the point, and the top one is removed. The click is kept and lands on the other, as on main (#479).
- **The 80 ms bound.** A Chromium correction slower than 80 ms keeps the approximate hit, as main does (#480). It happened in 3 of 3,120 warm rows.
- **The element route's hit.** The element route builds from the action's own, approximate hit, not the corrected one. CfT's `overcontrol` still presses the overlay group and reaches nothing, as on main (#481).
- **Controls the record does not know.** An unrecorded control that arrives at the point, or an inert element that gains AXPress, keeps main's verdict (#482).
- **An overlay reached only by the re-hit.** If an overlay the screenshot showed is reached only by the corrected hit, it stays refused `appWindowOverPoint`; #453's row press does not take it (#486).
- **`veilinto`'s link point.** On Chromium it is kept through `recordedHit` (cold) and `hitAboveNode` (warm), on main and the fix alike, so the check never runs there. On Electron and on warm CfT the click lands on B, and on cold CfT the element route presses A. Its text point is refused `otherControlOnTop` (#490).
- **Cost.** The wait costs 80 ms plus a second hit-test on every Chromium click on the two keep paths, and it is taken again at the element route's recheck. An early exit when the first answer is already final is #491.
