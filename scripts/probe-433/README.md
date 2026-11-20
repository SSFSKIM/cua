# #433 hosted qualification: a click recorded on a click-through overlay lands on a different control under it

A disposable hosted macOS kit, not product code, built from `probe/435-qual` (`d7052b79`, workflow `probe-435-qual.yml`, id 424694563; its README holds the harness, #435's discovery and its regression set on main `f8f34652`), itself built from #431's kit (`probe/431-qual`, `3f97d533`). #433: when the observation's record holds a non-interactive overlay at the click point, the stale-point guard finds it alive and in place and keeps the click, which passes through the overlay to whatever control lies under it now. The fix (`fix/433-overlay-target`) makes the guard also vouch for the recorded interactive node under the overlay. This kit qualifies it main against fix on `twincover` at both points, three control cells and #431's regression set.

```sh
gh workflow run probe-433-qual.yml --ref probe/433-qual -f main="$MAIN_SHA" -f mode=smoke -f cells=twincover,overcontrol,scrim,nounder
# The qualification: three batches, one in flight at a time, each lane under 500 rows.
gh workflow run probe-433-qual.yml --ref probe/433-qual -f main="$MAIN_SHA" -f fix="$FIX_SHA" -f mode=qualify -f reps=20 -f cells=twincover,overcontrol,scrim,decomove
gh workflow run probe-433-qual.yml --ref probe/433-qual -f main="$MAIN_SHA" -f fix="$FIX_SHA" -f mode=qualify -f reps=10 -f cells=nounder,rebuildunder,bgbutton,textbehind,twin,twincap,remount,retext,plain,like,btnremount,tableremount,tablecellremount
gh workflow run probe-433-qual.yml --ref probe/433-qual -f main="$MAIN_SHA" -f fix="$FIX_SHA" -f mode=qualify -f reps=10 -f cells=inbox,reltime,shrink,linksave,moved,linkmono,right,centre,wideoverlay,stickyscroll,tipremount,twinunder
```

An empty cell filter is not the #433 qualification: it carries #435's frameless twins (which no browser lists frameless, so they cannot be covered) and #431's other cells.

What #433 adds to #435's kit:
- **The overlay** (`page.mjs` `cover`): a group with role `group`, nested two groups below the target's row (each layer `position: absolute` over the row), so it lies deeper in the accessibility tree than the link's text and the record (StalePoint.swift `deepestScreenshotNode`: the deepest recorded node whose shown frame holds the point) takes it at the text point as well as the link point. #431's `twincover` laid it as the link's sibling, so the record held it at the link point only. Placement must find at the point (`nodeAt`) the fixture's overlay itself (`check.mjs` `overlayAt`: an AXGroup whose frame holds the link's, within 2 pt, for `veil` and `scrim`; one lying wholly past the link's right edge for `beside`), else the row is invalid (`placement`); the overlay's frame is not matched across observations, so `ax.recorded` is unset for these cells; `score`'s `misplaced` compares the guard's `recordedRole` with AXGroup (`cells.mjs` `records`).
  - `veil`: over the row, `pointer-events: none` on every layer, so a click goes through to what lies under it.
  - `scrim` (ruling 903): over the row with no pointer-events rule and no interactive role, so it catches the click.
  - `beside`: a veil 240 px wide laid 20 px past the target's right edge, over nothing interactive.
- **Cells**:
  - `twincover` (kind twin, `veil`, both points): link A under the veil; after the observation A is removed and a same-label link B, alive in the second row, moves up into its place. Main keeps the live overlay (`sameElement`), and where the click is posted as events it falls through to B.
  - `overcontrol` (kind keep, `veil`, both points): the veil over link A and nothing changes. On Chrome for Testing it may land on neither head: the shared-mode element route presses the accessibility hit, here the overlay group, and refuses (`backgroundClickRefused`); the smoke measures it.
  - `scrim` (kind asMain, `scrim`, both points): the scrim over a live, unchanged link A; on main the scrim eats the click.
  - `nounder` (kind asMain, `beside`, the link point only, aimed 60 pt past the link's right edge): the veil with nothing interactive under it, nothing changing.
  - The fix review's regressions (kind keep, `veil`, both points; gate `overlayKept`, kept and landed as main): `rebuildunder` (link A inside a list, the veil in a branch of its own, nested two more groups so it stays deeper than A's text; `mark` re-renders the list in place with a new A, its label unchanged) and `bgbutton` (an unrelated "Close" button behind the link, a later sibling the size of the link's box drawn below it; `mark` removes it, the link and its text unchanged).
  - The second fix wave's cells: `textbehind` (kind keep, no overlay, gate `keptAsMain`: a text "Saved" behind the link, an earlier sibling drawn below it, changed to "Saving"; the link and its text unchanged) and `decomove` (kind twin, gate `overlayTwin`: an inert decoration, a group nested two deep inside link A the size of its box, moved into a new link B, "Next", at A's place; the record holds the decoration alive, so main keeps and lands on B; the fix must refuse and never reach B). `decomove` runs in batch A, at 20, to keep batch B under 500 rows.
  - The fix's costs, the builder's, reported on both heads and never gated (`reportOnlyAt` every point; `gates.reportOnly` tallies their verdicts): `stickyscroll` (a header strip fixed to the viewport over the target's row, catching the pointer; `mark` scrolls the page 128 px, so the link moves away under it and Drafts comes under the header: main keeps the header, the fix may refuse the link beneath as moved); `tipremount` (the veil over link A, A re-rendered whole with its label: the fix judges A beneath by #431's strict form); `twinunder` (the veil over the first of three "Delete" links, re-rendered whole: the record holds the link beneath's twins).
  - Every row records the fix's `stalePoint.underlyingRole` and `underlyingIdentity` (`handle` or `recreated`, set whenever its check of the control beneath ran; absent on main); `report.mjs` tabulates them per unit and head (`Underlying`).
- **Gates** (`check.mjs` `gates`, qualify only):
  - `overlayTwin`: no valid fix row of `twincover` reaches B or any other control (A is gone), and none has no guard record or a record at another role (`no-guard`, `misplaced`); each unit needs at least the usable-pairs bar (10, or 80% of a shorter run's repetitions) of rows recording the overlay on each head (fix: refused or kept), else the gate fails as inconclusive (`evidence`, `thin`). How many refused, and why, is reported beside (`refused`, `perUnit`); a keep that reaches nothing passes and is reported.
  - `overlayKept`: `overcontrol` kept and landed on A on every valid fix row, as main row for row, reason included.
  - `overlayAsMain`: `scrim` and `nounder` as main row for row, reason included, on a usable baseline: every valid main row kept by the guard (`mainUnkept`).
  - Both overlay control gates fail on any valid row of either head with no guard record or a record at another role (`unguarded`).
  - `twinAsMain`: the regression twins (`twin`, `twincap`, every twin but the overlay and frameless ones) as main row for row, reason included, beside `twinRefused` and `twinUnrecorded` (which accept `interactiveHit` without comparing).
  - Every paired gate (`keptAsMain`, `othersAsMain`, `twinAsMain` and the overlay gates) now fails on a different guard reason too (#435's counted it only), and on any fix row, valid or invalidated (its captured page log), whose click reached a control, the target included, that no valid main row of its unit reached (`reachBeyondMain`).
  - `reproduced` is reported only: per `twincover` unit, main's valid rows that kept the click and logged a click on B. On Chrome for Testing the shared-mode element route presses the overlay itself and posts no event (#431's run 44642664004: `backgroundClickRefused`), so main reaches nothing there.
  - Unchanged: `coverage`, `twinRefused` (now without `twincover`), `twinUnrecorded`, `noWrongTarget`, `presentation`, `guardMs`; #435's `twinFrameless` has no unit in these runs.
- **Report** (`report.mjs <dir>`, from `gh run download <id> -D <dir>`): per unit and head, what the record held (`recordedRole`), the hit, and the controls the click reached, beside #435's columns; `stalePoint.ms` per head.

The harness (heads, lanes, presentation under the owned cover, setup checks, per-trial evidence, the keep, twin and #340 cells) is #435's, as its README describes.

## Batch A: main against 2a1b0368

Main `870dd117615bbfce72e637b8749b4b24293b8fa5`; fix `2a1b0368744b60666ddfbf1d7f15124d2482ed44` (the first fix wave, which a later head supersedes for batches B and C). Kit `9cd63c7b`, mode qualify, 20 rows per head per unit, heads interleaved: [run 44715767925](https://github.com/SSFSKIM/cua/actions/runs/44715767925). Every row valid, no abort, every lane in the background under the cover; the record held the overlay (AXGroup) in every row. A cell gives the verdict and the guard's reason per head, and on the fix the control beneath it judged (`underlyingRole:underlyingIdentity`, `none` when not found):

| Unit | cft: main | cft: fix | safari: main | safari: fix | electron: main | electron: fix |
|---|---|---|---|---|---|---|
| twincover/text | kept-missed sameElement 20 | refused nodeGone 20 [AXLink:none 20] | refused newElementOverPoint 20 | refused newElementOverPoint 20 | wrong-target sameElement 20 | refused nodeGone 20 [AXLink:none 20] |
| twincover/link | kept-missed sameElement 20 | refused nodeGone 20 [AXLink:none 20] | refused interactiveHit 20 | refused interactiveHit 20 | wrong-target sameElement 20 | refused nodeGone 20 [AXLink:none 20] |
| overcontrol/text | kept-missed sameElement 20 | kept-missed sameElement 20 [AXLink:handle 20] | kept-landed nonInteractiveHit 20 | kept-landed nonInteractiveHit 20 [AXLink:handle 20] | kept-landed sameElement 20 | kept-landed sameElement 20 [AXLink:handle 20] |
| overcontrol/link | kept-missed sameElement 20 | kept-missed sameElement 20 [AXLink:handle 20] | kept-landed recordedHit 20 | kept-landed recordedHit 20 | kept-landed sameElement 20 | kept-landed sameElement 20 [AXLink:handle 20] |
| scrim/text | kept-missed sameElement 20 | kept-missed sameElement 20 [AXLink:handle 20] | kept-missed sameElement 20 | kept-missed sameElement 20 [AXLink:handle 20] | kept-missed sameElement 20 | kept-missed sameElement 20 [AXLink:handle 20] |
| scrim/link | kept-missed sameElement 20 | kept-missed sameElement 20 [AXLink:handle 20] | kept-missed sameElement 20 | kept-missed sameElement 20 [AXLink:handle 20] | kept-missed sameElement 20 | kept-missed sameElement 20 [AXLink:handle 20] |
| decomove/text | wrong-target sameElement 20 | refused nodeGone 20 [AXLink:none 20] | refused nodeGone 20 | refused nodeGone 20 | wrong-target sameElement 20 | refused nodeGone 20 [AXLink:none 20] |
| decomove/link | wrong-target sameElement 20 | refused nodeGone 20 [AXLink:none 20] | refused nodeGone 20 | refused nodeGone 20 | wrong-target sameElement 20 | refused nodeGone 20 [AXLink:none 20] |

| Lane | Head | stalePoint.ms p50 / p95 / max (n), all | kept | refused | text point |
|---|---|---|---|---|---|
| cft | main | 1.999 / 8.321 / 10.385 (160) | 1.999 / 8.321 / 10.385 (160) | – | 1.999 / 8.784 / 10.385 (80) |
| cft | fix | 4.223 / 12.38 / 16.448 (160) | 1.79 / 3.892 / 16.448 (80) | 7.461 / 14.069 / 15.16 (80) | 4.331 / 14.069 / 16.448 (80) |
| safari | main | 3.042 / 11.438 / 15.316 (160) | 2.034 / 6.161 / 8.329 (80) | 6.127 / 11.77 / 15.316 (80) | 2.488 / 11.438 / 15.316 (80) |
| safari | fix | 4.158 / 11.252 / 23.274 (160) | 2.276 / 7.002 / 12.15 (80) | 6.185 / 11.931 / 23.274 (80) | 3.91 / 11.445 / 23.274 (80) |
| electron | main | 1.48 / 3.149 / 5.099 (160) | 1.48 / 3.149 / 5.099 (160) | – | 1.449 / 3.053 / 4.234 (80) |
| electron | fix | 4.009 / 10.363 / 17.532 (160) | 2.103 / 3.302 / 9.392 (80) | 7.94 / 11.15 / 17.532 (80) | 4.299 / 10.179 / 15.394 (80) |

| Run | Lane | Image | Browser | Rows | Abort | Gates failing |
|---|---|---|---|---|---|---|
| A-44715767925 | cft | 20261102.0473.1 | 156.0.8078.80 | 320/320 | none | overlayKept |
| A-44715767925 | electron | 20261102.0473.1 | Electron 44.4.5 / Chromium 152.0.7977.130 | 320/320 | none | none |
| A-44715767925 | safari | 20261117.0516.1 | 27.2 | 320/320 | none | none |

- **`twincover` never reaches B on the fix** (`overlayTwin` passes on every lane): Electron, where main lands on B at both points (40 of 40), and CfT, where main keeps but posts nothing (`backgroundClickRefused`), refuse `nodeGone` with the link beneath gone. Safari refuses on both heads, as main does (it hit-tests through the veil), so the new check never runs there.
- **`decomove`** is the same on every lane: main lands on B on CfT and Electron (wrong target, 40 of 40 each); the fix refuses `nodeGone`; Safari refuses on both heads.
- **The controls answer as main, row for row, reason included**: `overcontrol` kept and landed on Electron and Safari; `scrim` eaten on every lane; no fix click reached anything main's did not. CfT fails `overlayKept` on main's own baseline: main keeps every `overcontrol` row but the shared-mode element route presses the overlay group and posts nothing (`backgroundClickRefused`), so neither head lands (`mainNotKept` 40, `differ` 0, `reasonDiffer` 0). That is the lane's route, not the fix.
- **The guard's time.** The fix's p50 rises from 1.5-3.0 ms to 4.0-4.2 ms, and its p95 from 3.1-11.4 to 10.4-12.4 ms: its refusals take 6-8 ms at p50 (the search for the control beneath); its keeps stay within 0.6 ms of main's. Maximum 23.3 ms (Safari).
