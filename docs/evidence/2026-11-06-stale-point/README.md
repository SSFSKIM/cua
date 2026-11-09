# #296's hosted A/B: the built stale-point guard refuses every stale click it guards, with nothing posted, and keeps the clicks whose target stayed

**This is #296's A/B of the built guard.** It ran on GitHub-hosted macOS runners, with no owner and no MacBook slot. It compares `fix/296-stale-point` at a7a43b02 with main at d482bcc2, cell by cell.

**The sections follow the build through three heads.** This first A/B ran a7a43b02, and the re-run ran 7f79ca34. The final section ran 2fdb9c98, the head to merge; it is the build's evidence. The earlier sections stay as history.

Results:
- **Refusals.** The branch refused every stale coordinate click and drag start it guards: #294's toolbar re-layout, a feed's prepend, a scrolled list, a control swapped for another, a control moved, and a re-rendered label. Each answered `screenChangedSinceScreenshot`, with `startedAt` null and no effect on the app.
- **Main on the same clicks:** it posted every one. Each landed on whatever was now at the point, or on nothing.
- **Kept clicks:** the branch kept 75 of the 76 clicks whose target had stayed under the point. The one refusal of such a click is a rebuilt button, below.
- **Shared mode, Chrome in the background:** stale clicks were not guarded. The guard answered `skipped`, and #282's element route pressed the element now at the point, as main does. The design session's ruling ca82a6f4 closes that gap: the re-run section below repeats those cells against its build (7f79ca34), and the final section repeats them against the head to merge (2fdb9c98); both refuse all of them.

- **The kit:** the `probe/296-hosted` branch at 75437d03:
  - `scripts/probe-296/ab.mjs`;
  - `scripts/probe-296/app.swift`, a native AppKit window of changing controls;
  - `.github/workflows/probe-296.yml`, which builds both engines on each runner.

  It stays off main.
- **The run:** https://github.com/SSFSKIM/cua/actions/runs/42184616121, six jobs, groups chrome, safari and native, two reps each on separate runners.
  - Chrome rep 1 and rep 2, native rep 2 and Safari rep 2 ran on image 20261102 (macOS 26.7.2, Chrome for Testing 156.0.8078.80).
  - Native rep 1 and Safari rep 1 ran on image 20261026 (macOS 26.6.2).
- **The records:** `run-42184616121/<group>-rep<n>/results.json`. Each cell carries:
  - the engine's answer: the click's or drag's result, or its error, with the meta's `stalePoint`;
  - the observation's node count and timings;
  - the point posted, in screenshot pixels and in global points;
  - the deepest node of the observation at that point;
  - the change the cell made, and when;
  - the effect: the page's click and pointerdown beacons with the element's id and text, the native app's click log, or Reload's GET.
- **The setup:** each cell gets a fresh engine and a fresh connection. Each cell:
  1. Observe with a screenshot.
  2. Change the app halfway to the click, or not.
  3. Click, or drag 100 pt right, at the centre of the target the observation showed.

  TextEdit stays frontmost unless a cell brings the target forward. Chrome's page cells start 25 s after launch, past its toolbar's re-layout. The toolbar's cells launch a fresh Chrome each.

## The branch against main

Both reps agree in every cell but one, `chrome/dedicated/recreate/20s`, below. "Refused" means `screenChangedSinceScreenshot`, `startedAt` null, and no effect seen. The guard's `identity` is `handle` unless marked.

| Cell | Where | Branch's `stalePoint` | Branch's effect | Main's effect |
|---|---|---|---|---|
| #294: Reload at launch + 24 s, at the first screenshot's point | Chrome, shared and dedicated | refused, `frameMoved` | none | posted, no reload |
| Reload 1 s after the observation | Chrome, shared and dedicated | kept, `sameElement` | reloaded | reloaded |
| Feed prepending every 2 s, 5 s | Chrome dedicated, Safari | refused, `frameMoved` | none | item-11 (the target was item-8 or item-9) |
| List scrolled 90 px, 5 s | Chrome dedicated, Safari | refused, `frameMoved` | none | row-17 (the target was row-14) |
| Save swapped for another element, Delete, 5 s | Chrome dedicated, Safari, native both modes | refused, `nodeGone` (the title amendment) | none | Delete |
| A button replaced by a link, or by a checkbox | Chrome dedicated, Safari / native | refused, `nodeGone` | none | the link / the checkbox |
| A native button moved 140 pt | native, both modes | refused, `frameMoved` (the hit is the window) | none | posted, nothing hit |
| Limit (i): 'Like (12)' re-rendered as 'Like (13)' | Chrome dedicated, Safari, native both modes | refused, `nodeGone` | none | Like (13) |
| Limit (ii): Save relabelled 'Delete' on one element | Chrome dedicated, Safari, native both modes | kept, `sameElement` | the element, now labelled "Delete" | the same |
| A drag starting on a feed item, 5 s | Chrome dedicated | refused, `frameMoved` | no pointerdown | pointerdown on item-11 |
| A drag starting on a still button | Chrome dedicated | kept | pointerdown on it | the same |
| Shared, Chrome frontmost: feed, and the button swapped for a link | Chrome shared | refused, `frameMoved` / `nodeGone` | none | item-12 / the link |
| Shared, Chrome in the background: the same two | Chrome shared | **skipped**, `frameMoved` / `nodeGone` | **AXPress on item-11 / on the link** | the same |

### The clicks whose target stayed (1 s and 20 s)

| Cell | Where | Branch's `stalePoint` | Delivered |
|---|---|---|---|
| A label ticking every 100 ms | Chrome dedicated, Safari, native both modes | kept, `sameElement` | 16 of 16 |
| A counter beside a button | Chrome, Safari; a clock label beside a button on native | kept, `sameElement` | 16 of 16 |
| A pulsing button | Chrome, Safari | kept, `sameElement` | 8 of 8 |
| A list with no scroll | Chrome, Safari | kept, `sameElement` | 8 of 8 |
| A button rebuilt identically every 500 ms | Chrome, Safari, native both modes | kept, `sameElement`, `recreated` | 15 of 16 |
| A link's text | Chrome, Safari, 1 s | kept, `sameElement` (the recorded node and the hit are the link's AXStaticText) | 4 of 4 |
| A page button, 1 s | Chrome | kept, `sameElement` | 2 of 2 |

- **The one wrong refusal:** `chrome/dedicated/recreate/20s` rep 1 answered `refused, nodeGone` with no hit role. The hit-test at the point answered nothing readable, so no re-created handle could be looked for.
  - The button is rebuilt every 500 ms, so the click met the moment between the old element and the new one.
  - Its sentence reads "...is gone; element is there now": the hit is named "element" when it has no role.
  - One of the 16 rebuilt-button cells.
- **No Chrome page button was hit-tested to its AXStaticText.** The engine's hit-test answers the AXButton, so the verdict is `sameElement`, not `nonInteractiveHit`. The spike's out-of-process hit-test had answered the label.
- **No `hitAboveNode` was seen live.** On a link's text, both browsers' trees list the AXStaticText, and the hit-test answers that same element.

## What disagrees with the Decision Log

- **Shared mode with Chrome in the background is not protected.** As built, item 2 of the entry has the guard stand aside where #282 element-routes the pointer. The route then presses the control at the point, which is the stale point's new occupant: item-11 instead of item-9, the "Remove" link instead of "Keep". Main does the same. The design session ruled on 2026-11-06 (ca82a6f4) that the guard runs on that path too: before the route, and again just before the press.
- **A rebuild can fall between its two elements.** The re-created search starts from the hit. When the hit-test answers nothing for that moment, the verdict is `nodeGone`, not `noHit` and not a re-created handle. The narrowest fix is one more hit-test after a short pause before answering `nodeGone` with no hit. The sentence should also not name a hit it cannot name.
- **Item 5's `nonInteractiveHit` example** ("Chrome hit-tests a page button to its label's AXStaticText") did not happen through the engine: the engine's hit-test answered the button.

## The cost

The meta's `stalePoint.ms` on every guarded click and drag of the branch:

| App | Cells | Median | p95 | Max |
|---|---|---|---|---|
| Chrome for Testing | 56 | 0.67 ms | 6.45 ms | 6.88 ms |
| Safari | 34 | 0.51 ms | 5.63 ms | 8.03 ms |
| Native window | 44 | 0.74 ms | 2.41 ms | 3.14 ms |

- **Where the p95 comes from:** the re-created search, which runs when the recorded handle is gone: the rebuilt button, the swaps, the re-rendered Like. A live handle checks in under 1 ms.
- **`stalePointRecord`** (the observation's record of its nodes, `timings.stalePointRecordMs`): this run read the wrong key, so it has no value. Run https://github.com/SSFSKIM/cua/actions/runs/42185576996 (kit e9939802, the same engines) measured it on kept cells of each app; its records are `run-42185576996/<group>-rep<n>/results.json`.

  | App | Observations | Median | p95 | Max |
  |---|---|---|---|---|
  | Chrome for Testing | 12 | 0.18 ms | 0.47 ms | 0.47 ms |
  | Safari | 8 | 0.24 ms | 0.45 ms | 0.45 ms |
  | Native window | 8 | 0.12 ms | 0.20 ms | 0.20 ms |

- **The rebuilt button's wrong refusal recurred** in that run: `chrome/dedicated/recreate/20s` rep 1 answered `refused, nodeGone` with no hit, at 0.45 ms, again on its first runner. The other eleven rebuilt-button cells there (Chrome, Safari and native, 1 s and 20 s, both reps) were kept.

## The re-run: the guard on #282's element-routed path (7f79ca34)

The design session ruled on 2026-11-06 (ca82a6f4) that the guard also runs where #282 element-routes a shared-mode page click:
- once before the route;
- again just before the press, after the route's re-read wait;
- and the pressed element must be the recorded node or its allowlisted ancestor.

The build is `fix/296-stale-point` at 7f79ca34 (engine b76e4e93).

What changed in the build:
- `stalePoint.verdict` is now only `kept` or `refused`.
- A new `rechecked: true` marks a second check after the re-read; `ms` is then the sum of both checks.
- A new refusal reason, `pressedOther`.
- With the handle dead, an empty or unreadable hit is now hit-tested again, up to 3 × 50 ms.

- **The run:** https://github.com/SSFSKIM/cua/actions/runs/42187363305, the kit at 33590bed (`ab.mjs --group rerun`), two reps on separate runners. Both ran on image 20261026 (macOS 26.6.2, Chrome for Testing 156.0.8078.47). Main is still d482bcc2.
- **The records:** `run-42187363305/rerun-rep<n>/results.json`.
- **The setup:**
  - Shared mode with Chrome in the background, except for the regression cells marked dedicated.
  - The re-read cells launch a fresh Chrome. Its first observation makes the process's accessibility fresh, so a press 0.1 s later waits in #282's re-read for the control's action.
  - The swap cell's page swaps Save for a Delete button 1 s into the click.

| Cell | Branch's `stalePoint` and answer | Branch's effect | Main's effect |
|---|---|---|---|
| Feed, 5 s | refused, `frameMoved`; `screenChangedSinceScreenshot`, `startedAt` null | none | AXPress on item-11 |
| Button replaced by a link, 5 s | refused, `nodeGone`, the hit the link's AXStaticText | none | AXPress on the link "Remove" |
| Save swapped for another element, Delete, 5 s | refused, `nodeGone` | none | AXPress on Delete |
| A fresh point on a still button, 5 s | kept, `sameElement`; element-routed (AXPress) | one pointerdown and one click on it | the same |
| Re-read window, no change: press 0.1 s after a fresh Chrome's first observation | kept, `nonInteractiveHit`, **`rechecked: true`** (1.9 and 5.3 ms); AXPress after a 1.6–1.8 s wait | one click on it | the same |
| Re-read window, Save swapped for Delete 1 s into the click | rep 1: `kept, sameElement` at the first check, then #282's own `backgroundClickRefused` (no action appeared within 2.2 s; `startedAt` null). Rep 2: kept, `nonInteractiveHit`, `rechecked: true`, then AXPress on the old button, answering `actionFailed` ("The element did not accept the AXPress action") | none in either | none: #282's `backgroundClickRefused`, both reps |
| Toolbar Reload at launch + 24 s | refused, `frameMoved` | none | posted, no reload |
| Toolbar Reload at 1 s | kept | reloaded | reloaded |
| Rebuilt button, Chrome dedicated, 1 s and 20 s (2 and 6 cells) | kept, `sameElement`, `recreated` in all 8 | delivered in all 8 | not run |
| Save swapped for another element, Delete, Chrome dedicated | refused, `nodeGone` | none | Delete |
| Limit (ii), Chrome dedicated | kept | the element, now labelled "Delete" | the same |

- **The gap the ruling targeted is closed.** In shared mode with Chrome in the background, every stale page click is refused, with nothing pressed: 6 of 6. Main presses the stale point's new element: item-11, the link, Delete. A fresh point is still element-routed and seen once.
- **The rebuilt button's wrong refusal is gone.** All 8 rebuilt-button cells were kept and delivered, including the 6 at 20 s, where a7a43b02 refused one in each run.
- **The second check ran** on both re-read cells with no change (`rechecked: true`, after a 1.6–1.8 s wait).
- **The second check did not refuse the swap.** Nothing wrong was pressed in either rep, but not because of the guard:
  - **Rep 1:** the swapped-out button never advertised an action, so #282 refused first.
  - **Rep 2:** the action appeared and the second check ran about 1.26 s into the click, after the page's swap at about 1.1 s. It still found the recorded handle answering its frame, with the hit its label. The route pressed that old element, which did not accept the press.
  - So in this window Chrome's tree had not yet caught up with the DOM, and the guard can only see the tree. The cell does not show a `pressedOther` or second-check refusal live. The final section swaps at 0.3, 0.6 and 1 s into the click instead.
- **No `pressedOther`** was seen.
- **No refusal with an unknown hit** was met, so the sentence without "X is there now" was not seen live.

### The re-run's cost

| | Cells | Median | p95 | Max |
|---|---|---|---|---|
| `stalePoint.ms`, Chrome | 28 | 3.36 ms | 7.07 ms | 7.96 ms |
| `stalePointRecordMs`, Chrome | 28 | 0.21 ms | 1.85 ms | 2.47 ms |

The median is higher than the first A/B's because more of this run's cells take the re-created search: the rebuilt buttons and the swaps. The `rechecked` cells carry both checks: 1.9, 5.3 and 6.7 ms. The record's two slowest, 2.47 and 1.85 ms, are single observations on rep 2: a rebuilt-button page and a feed page, of 60 and 71 nodes. Every other observation recorded in under 0.7 ms.

## The final A/B: the build at 2fdb9c98

**The engine of this run is `fix/296-stale-point` at 2fdb9c98, the head to merge.** The sections above ran a7a43b02 and 7f79ca34; they stay as history. Main is still d482bcc2.

What changed since 7f79ca34:
- The route uses the guard's recovered hit.
- The final check runs at the real pre-perform boundary, after any focus hold. When a hold ran, it re-reads with a fresh hit-test.
- An incomplete container passes like any node, and its interior reports `unrecordedDescendant`.
- The `relabelled` reason is gone.
- A refusal after an activation carries `afterActivation: true` and the sentence "The app was activated in the background, but nothing was pressed."

- **The run:** https://github.com/SSFSKIM/cua/actions/runs/42189536608, the kit at 598740be, six jobs: groups `final` (Chrome for Testing), `safari-final` and `native-final`, two reps each on separate runners.
  - Final rep 1, both native reps and Safari rep 2 ran on image 20261026 (macOS 26.6.2, Chrome for Testing 156.0.8078.47).
  - Final rep 2 and Safari rep 1 ran on image 20261102 (macOS 26.7.2, Chrome for Testing 156.0.8078.80).
- **The records:** `run-42189536608/<group>-rep<n>/results.json`.
- **The new cells:**
  - The re-read-window swap at 0.3, 0.6 and 1 s into the click, three per runner at each timing, branch only.
  - #294's case in dedicated mode.
  - A removed button ("Archive") with nothing in its place; 300 ms later TextEdit's window is moved over the point.
  - The regression sets for Safari and the native window.
- **The count:** 72 branch cells, 52 as their cell expected. All 20 others are the re-read-window swaps, below, and none of them pressed anything wrong.

| Cell | Where | Branch | Branch's effect | Main's effect |
|---|---|---|---|---|
| Feed, 5 s | Chrome shared (background); Safari | refused, `frameMoved`; `screenChangedSinceScreenshot`, `startedAt` null | none | AXPress on item-11 / item-11 |
| Button replaced by a link, 5 s | Chrome shared (background) | refused, `nodeGone` | none | AXPress on the link |
| Save swapped for another element, Delete, 5 s | Chrome shared (background) and dedicated; Safari; native both modes | refused, `nodeGone` | none | Delete |
| A fresh point, 5 s | Chrome shared (background) | kept, `nonInteractiveHit`, `rechecked`, `afterActivation`; AXPress | one click | the same |
| The re-read window, no change: press 0.1 s after a fresh Chrome's first observation | Chrome shared | kept, `rechecked`, `afterActivation`; AXPress after a 1.6–1.7 s wait | one click | the same |
| The re-read window, Save swapped for Delete at 0.3, 0.6 or 1 s into the click (18 cells) | Chrome shared | kept at the first check, then #282's own `backgroundClickRefused` ("the control there exposes no action yet") at 2.01–2.16 s; no final check, `startedAt` null | none | not run |
| The first run's re-read swap cell, the swap at 1 s | Chrome shared | rep 1: as the 18 above. Rep 2: its observation came 13.8 s after launch, so the control already had its action. Kept, `rechecked`, `afterActivation`; AXPress at 247 ms, before the swap | rep 1 none; rep 2 one click on Save | #282's `backgroundClickRefused` |
| #294: Reload at launch + 24 s | Chrome shared and dedicated | refused, `frameMoved` | none | posted, no reload |
| Reload 1 s after the observation | Chrome shared | kept | reloaded | reloaded |
| Rebuilt button, 1 s and 20 s × 3 | Chrome dedicated | kept, `recreated`: 8 of 8 | delivered: 8 of 8 | not run |
| Limit (ii): Save relabelled 'Delete' on one element | Chrome dedicated | kept | the element, now labelled "Delete" | the same |
| A ticking label, 20 s | Safari | kept | delivered | not run |
| A native button moved 140 pt | native, both modes | refused, `frameMoved`, the hit the window | none | posted, nothing hit |
| Limit (i): 'Like (12)' re-rendered as 'Like (13)' | native, both modes | refused, `nodeGone` | none | Like (13) |
| A removed button, its point then under TextEdit's window | Chrome dedicated; native, both modes | refused, `nodeGone`; the hit is the page's AXWebArea / the window | none | posted, nothing hit |

### What was not observed live

The offline tests on the branch cover each of these; this run could not reach them.
- **A refusal at the final check, after the focus hold.** In all 18 swaps during the re-read window, the swapped-out control never advertised an action. #282's own no-action refusal then ended the click at its re-read deadline, before the final check, posting nothing.
  - For the final check to refuse, the change has to land after the control's action appears and before the press. The route polls for the action every 100 ms and presses as soon as it appears.
  - That gap cannot be hit from the page on a timer. Every swap-before-action ends in #282's refusal; the one cell whose action was already there pressed before its swap.
- **`pressedOther`.** It needs the element the route would press to be neither the observed node nor its allowlisted ancestor, while the node itself still passes the guard. On these pages the route presses the hit's control, and every hit the guard passed resolved to the observed node.
- **The no-hit sentence**, the one without "X is there now". It needs a hit-test that answers nothing at the point.
  - With the button removed and another app's window moved over the point, the target app's own hit-test still answered its element underneath: the page's AXWebArea in Chrome, the window in the native app.
  - So the sentence named it: '...the AXButton "Archive" it showed at this point is gone; AXWebArea "probe296 vanish" is there now.'
  - A point where the app answers nothing is outside its observed window, where the engine does not place a click.

The refusal after an activation (`afterActivation: true` with its sentence) was not met either. Every refusal in this run came before anything was activated. `afterActivation: true` did ride on the kept element-routed clicks: the fresh point and the re-read cells.

### The final A/B's cost

| App | `stalePoint.ms` cells | p95 | Max | `stalePointRecordMs` p95 | Max |
|---|---|---|---|---|---|
| Chrome for Testing | 50 | 15.5 ms | 28.9 ms | 0.90 ms | 1.02 ms |
| Safari | 6 | 6.5 ms | 6.5 ms | 0.32 ms | 0.32 ms |
| Native window | 16 | 8.6 ms | 8.6 ms | 9.49 ms | 9.49 ms |

- **Chrome's high end** is the five clicks whose meta sums two checks around the focus hold: 4.7, 5.2, 15.5, 28.7 and 28.9 ms. Chrome's 45 single checks have a p95 of 6.0 ms and a maximum of 6.5 ms.
- **The native record's p95** is one observation, of an 18-node window, at 9.49 ms. Every other observation in the run recorded in under 1.1 ms.
