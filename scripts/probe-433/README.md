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
  - The second fix wave's cells: `textbehind` (kind keep, no overlay, gate `keptAsMain`: a text "Saved" behind the link, an earlier sibling drawn below it, changed to "Saving"; the link and its text unchanged) and `decomove` (kind twin, gate `overlayTwin`: an inert decoration, a group nested two deep inside link A the size of its box, moved into a new link B, "Next", at A's place; the record holds the decoration alive, so main keeps and lands on B; reported, never gated, from the narrowed fix on: it has its own ticket, and the fix's check runs only under an inert overlay with no acting ancestor). `decomove` runs in batch A, at 20, to keep batch B under 500 rows.
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

## Results

Main `870dd117615bbfce72e637b8749b4b24293b8fa5` throughout. The fix moved four times while this ran; each head's runs are labelled with it:

| Fix head | What it is | Runs (kit) |
|---|---|---|
| `899c0e3b33bdce4f952accb78e00af3fcf4b2de1` | **Final**: the narrowed check (an inert overlay with no acting ancestor; a hit advertising AXPress never inert), kept when any recorded control under the overlay at the point is unchanged, refused only when none is | [confirmation 44748267096](https://github.com/SSFSKIM/cua/actions/runs/44748267096), [cost cells 44751491715](https://github.com/SSFSKIM/cua/actions/runs/44751491715) (`46bf0af6`), 5 per head per unit |
| `17942ad7247aed781d7ca95e1e3ec68c9ef92f53` | The narrowed check, refusing when the deepest recorded control under the overlay is gone | [A 44729764268](https://github.com/SSFSKIM/cua/actions/runs/44729764268) (`d096ff55`), [B 44733158011](https://github.com/SSFSKIM/cua/actions/runs/44733158011), [C 44740480524](https://github.com/SSFSKIM/cua/actions/runs/44740480524) (`46bf0af6`), 10 per head per unit |
| `d514da6f7a786d88e362eaa908bedea4626ceafe` | The second wave (with the link-text path), superseded | [B 44722388282](https://github.com/SSFSKIM/cua/actions/runs/44722388282) (`aff51f74`), 10 per head per unit |
| `2a1b0368744b60666ddfbf1d7f15124d2482ed44` | The first wave, superseded | [A 44715767925](https://github.com/SSFSKIM/cua/actions/runs/44715767925) (`9cd63c7b`), 20 per head per unit |

Smokes before the qualification: [main alone 44709631677](https://github.com/SSFSKIM/cua/actions/runs/44709631677) (`84ca4740`), [the overlay and cost cells against `0f79602f` 44711532112](https://github.com/SSFSKIM/cua/actions/runs/44711532112) (`2e6698f7`), [`rebuildunder` and `bgbutton` against `0f79602f` 44713749102](https://github.com/SSFSKIM/cua/actions/runs/44713749102) (`7c48bf3a`). Every run on every lane: every row valid, no abort, every lane in the background under the cover; the record held the overlay (AXGroup) on every overlay row. A table cell gives the verdict and the guard's reason per head, and on the fix the control beneath that its check judged (`underlyingRole:underlyingIdentity`; `none`, not found).

### Final head 899c0e3b: confirmation

| Unit | cft: main | cft: fix | safari: main | safari: fix | electron: main | electron: fix |
|---|---|---|---|---|---|---|
| twincover/text | kept-missed sameElement 5 | refused nodeGone 5 [AXLink:none 5] | refused newElementOverPoint 5 | refused newElementOverPoint 5 | wrong-target sameElement 5 | refused nodeGone 5 [AXLink:none 5] |
| twincover/link | kept-missed sameElement 5 | refused nodeGone 5 [AXLink:none 5] | refused interactiveHit 5 | refused interactiveHit 5 | wrong-target sameElement 5 | refused nodeGone 5 [AXLink:none 5] |
| remount/text | kept-landed sameElement 5 | kept-landed sameElement 5 | kept-landed sameElement 5 | kept-landed sameElement 5 | kept-landed sameElement 5 | kept-landed sameElement 5 |
| remount/link | kept-landed sameElement 5 | kept-landed sameElement 5 | kept-landed sameElement 5 | kept-landed sameElement 5 | kept-landed sameElement 5 | kept-landed sameElement 5 |
| retext/text | kept-landed sameElement 5 | kept-landed sameElement 5 | kept-landed sameElement 5 | kept-landed sameElement 5 | kept-landed sameElement 5 | kept-landed sameElement 5 |
| retext/link | kept-landed sameElement 5 | kept-landed sameElement 5 | kept-landed sameElement 5 | kept-landed sameElement 5 | kept-landed sameElement 5 | kept-landed sameElement 5 |
| plain/text | kept-landed sameElement 5 | kept-landed sameElement 5 | kept-landed sameElement 5 | kept-landed sameElement 5 | kept-landed sameElement 5 | kept-landed sameElement 5 |
| plain/link | kept-landed sameElement 5 | kept-landed sameElement 5 | kept-landed sameElement 5 | kept-landed sameElement 5 | kept-landed sameElement 5 | kept-landed sameElement 5 |
| overcontrol/text | kept-missed sameElement 5 | kept-missed sameElement 5 [AXLink:handle 5] | kept-landed nonInteractiveHit 5 | kept-landed nonInteractiveHit 5 [AXLink:handle 5] | kept-landed sameElement 5 | kept-landed sameElement 5 [AXLink:handle 5] |
| overcontrol/link | kept-missed sameElement 5 | kept-missed sameElement 5 [AXLink:handle 5] | kept-landed recordedHit 5 | kept-landed recordedHit 5 | kept-landed sameElement 5 | kept-landed sameElement 5 [AXLink:handle 5] |
| scrim/text | kept-missed sameElement 5 | kept-missed sameElement 5 [AXLink:handle 5] | kept-missed sameElement 5 | kept-missed sameElement 5 [AXLink:handle 5] | kept-missed sameElement 5 | kept-missed sameElement 5 [AXLink:handle 5] |
| scrim/link | kept-missed sameElement 5 | kept-missed sameElement 5 [AXLink:handle 5] | kept-missed sameElement 5 | kept-missed sameElement 5 [AXLink:handle 5] | kept-missed sameElement 5 | kept-missed sameElement 5 [AXLink:handle 5] |
| rebuildunder/text | kept-missed sameElement 5 | kept-missed sameElement 5 [AXLink:recreated 5] | refused newElementOverPoint 5 | refused newElementOverPoint 5 | kept-landed sameElement 5 | kept-landed sameElement 5 [AXLink:recreated 5] |
| rebuildunder/link | kept-missed sameElement 5 | kept-missed sameElement 5 [AXLink:recreated 5] | kept-landed recordedHit 5 | kept-landed recordedHit 5 | kept-landed sameElement 5 | kept-landed sameElement 5 [AXLink:recreated 5] |
| bgbutton/text | kept-missed sameElement 5 | kept-missed sameElement 5 [AXLink:handle 5] | kept-landed nonInteractiveHit 5 | kept-landed nonInteractiveHit 5 [AXLink:handle 5] | kept-landed sameElement 5 | kept-landed sameElement 5 [AXLink:handle 5] |
| bgbutton/link | kept-missed sameElement 5 | kept-missed sameElement 5 [AXLink:handle 5] | kept-landed recordedHit 5 | kept-landed recordedHit 5 | kept-landed sameElement 5 | kept-landed sameElement 5 [AXLink:handle 5] |
| decomove/text | wrong-target sameElement 5 | wrong-target sameElement 5 | refused nodeGone 5 | refused nodeGone 5 | wrong-target sameElement 5 | wrong-target sameElement 5 |
| decomove/link | wrong-target sameElement 5 | wrong-target sameElement 5 | refused nodeGone 5 | refused nodeGone 5 | wrong-target sameElement 5 | wrong-target sameElement 5 |

| Lane | Head | stalePoint.ms p50 / p95 / max (n), all | kept | refused | text point |
|---|---|---|---|---|---|
| cft | main | 2.556 / 18.046 / 22.341 (90) | 2.556 / 18.046 / 22.341 (90) | – | 2.442 / 18.046 / 22.341 (45) |
| cft | fix | 6.449 / 21.152 / 24.013 (90) | 6.365 / 22.142 / 24.013 (80) | 6.764 / 12.708 / 12.708 (10) | 7.472 / 22.142 / 24.013 (45) |
| safari | main | 2.798 / 9.752 / 14.26 (90) | 2.543 / 9.695 / 13.32 (65) | 4.05 / 12.51 / 14.26 (25) | 3.121 / 9.359 / 13.32 (45) |
| safari | fix | 3.421 / 10.692 / 15.681 (90) | 3.421 / 10.692 / 15.681 (65) | 3.186 / 9.934 / 11.319 (25) | 3.699 / 11.319 / 15.681 (45) |
| electron | main | 1.536 / 6.877 / 9.32 (90) | 1.536 / 6.877 / 9.32 (90) | – | 1.567 / 7.865 / 9.32 (45) |
| electron | fix | 3.249 / 8.866 / 10.384 (90) | 2.085 / 9.07 / 10.384 (80) | 6.17 / 7.887 / 7.887 (10) | 4.626 / 9.07 / 10.384 (45) |

| Run | Lane | Image | Browser | Rows | Abort | Gates failing |
|---|---|---|---|---|---|---|
| F | cft | 20261117.0516.1 | 157.0.8103.78 | 180/180 | none | overlayKept |
| F | electron | 20261102.0473.1 | Electron 44.4.5 / Chromium 152.0.7977.130 | 180/180 | none | none |
| F | safari | 20261102.0473.1 | 27.2 | 180/180 | none | overlayKept |

- **Ruling 909's gates hold on the final head.** `twincover` refuses on CfT and Electron at both points (5 of 5 each) and never reaches B; Safari refuses on both heads with main's reasons (it hit-tests through the veil, so the check never runs). The link-text and keep cells (`retext`, `plain`, `remount`) and `bgbutton`, `rebuildunder`, `overcontrol`, `scrim` answer as main row for row, reason included: 0 new refusals, 0 differing verdicts, 0 differing reasons on every lane. `bgbutton`, which 17942ad7 refused, is kept again (the check now finds the link beneath, `AXLink:handle`). No fix row reached a control main's did not; no wrong target the fix adds.
- `overlayKept` fails on CfT and Safari on main's own baseline only (`differ` 0, `reasonDiffer` 0): CfT never lands under an overlay on either head (its shared-mode element route presses the overlay group: `backgroundClickRefused`), and Safari refuses `rebuildunder/text` on both heads (`newElementOverPoint`).
- `decomove` (report only, its own ticket) answers as main: the click lands on B on CfT and Electron on both heads.
- **The 905 sentence**, captured from the fix's real `twincover` refusals (CfT and Electron, both points, 20 rows, every one this text):

  > The screen changed since the screenshot: the point lies on an AXGroup that does not act on its own, over the AXLink "Inbox" the screenshot showed there, which a click passes through to; that control is gone or was replaced. Nothing was sent. Call getScreenshot for a new screenshot and aim again from what it shows; the same point would reach whatever lies under the AXGroup now.

  Safari's `twincover` refusals carry main's sentences (`newElementOverPoint` at the text, `interactiveHit` at the link).

### Final head 899c0e3b: the cost cells (ruling 905)

| Unit | cft: main | cft: fix | safari: main | safari: fix | electron: main | electron: fix |
|---|---|---|---|---|---|---|
| stickyscroll/text | refused pressedOther 5 | refused frameMoved 5 [AXLink:handle 5] | kept-missed sameElement 5 | refused frameMoved 5 [AXLink:handle 5] | kept-missed nonInteractiveHit 5 | refused frameMoved 5 [AXLink:handle 5] |
| stickyscroll/link | refused interactiveHit 5 | refused interactiveHit 5 | kept-missed sameElement 5 | refused frameMoved 5 [AXLink:handle 5] | refused interactiveHit 5 | refused interactiveHit 5 |
| tipremount/text | kept-missed sameElement 5 | kept-missed sameElement 5 [AXLink:recreated 5] | refused newElementOverPoint 5 | refused newElementOverPoint 5 | kept-landed sameElement 5 | kept-landed sameElement 5 [AXLink:recreated 5] |
| tipremount/link | kept-missed sameElement 5 | kept-missed sameElement 5 [AXLink:recreated 5] | kept-landed recordedHit 5 | kept-landed recordedHit 5 | kept-landed sameElement 5 | kept-landed sameElement 5 [AXLink:recreated 5] |
| twinunder/text | kept-missed sameElement 5 | refused nodeGone 5 [AXLink:none 5] | refused newElementOverPoint 5 | refused newElementOverPoint 5 | kept-landed sameElement 5 | refused nodeGone 5 [AXLink:none 5] |
| twinunder/link | kept-missed sameElement 5 | refused nodeGone 5 [AXLink:none 5] | refused interactiveHit 5 | refused interactiveHit 5 | kept-landed sameElement 5 | refused nodeGone 5 [AXLink:none 5] |

| Lane | Head | stalePoint.ms p50 / p95 / max (n), all | kept | refused | text point |
|---|---|---|---|---|---|
| cft | main | 2.155 / 10.428 / 17.186 (30) | 1.673 / 10.428 / 10.428 (20) | 4.064 / 17.186 / 17.186 (10) | 3.048 / 10.428 / 10.428 (15) |
| cft | fix | 5.839 / 10.874 / 16.309 (30) | 8.373 / 16.309 / 16.309 (10) | 5.435 / 10.189 / 10.189 (20) | 5.873 / 10.874 / 10.874 (15) |
| safari | main | 2.778 / 6.565 / 16.787 (30) | 2.351 / 5.915 / 5.915 (15) | 3.107 / 16.787 / 16.787 (15) | 1.871 / 16.787 / 16.787 (15) |
| safari | fix | 3.102 / 9.817 / 10.755 (30) | 6.615 / 10.755 / 10.755 (5) | 2.446 / 8.029 / 9.817 (25) | 2.372 / 9.817 / 9.817 (15) |
| electron | main | 1.287 / 4.642 / 4.924 (30) | 1.086 / 2.371 / 4.642 (25) | 2.924 / 4.924 / 4.924 (5) | 1.086 / 4.642 / 4.642 (15) |
| electron | fix | 5.03 / 10.876 / 14.495 (30) | 6.188 / 14.495 / 14.495 (10) | 4.653 / 10.876 / 10.876 (20) | 4.66 / 14.495 / 14.495 (15) |

| Run | Lane | Image | Browser | Rows | Abort | Gates failing |
|---|---|---|---|---|---|---|
| cost-44751491715 | cft | 20261102.0473.1 | 156.0.8078.80 | 60/60 | none | none |
| cost-44751491715 | electron | 20261102.0473.1 | Electron 44.4.5 / Chromium 152.0.7977.130 | 60/60 | none | none |
| cost-44751491715 | safari | 20261117.0516.1 | 27.2 | 60/60 | none | none |

New refusals (the fix refused where main kept), per lane, CfT / Safari / Electron, on the final head (5 per head per unit) and on 17942ad7 (10, batch C):

| Cell | 899c0e3b | 17942ad7 | What main's keep did |
|---|---|---|---|
| `stickyscroll` | 0 of 0 / 10 of 10 / 5 of 5 | 0 of 0 / 20 of 20 / 10 of 10 | nothing (the header ate the click); CfT's main already refused (`pressedOther`, `interactiveHit`), as Electron's at the link |
| `tipremount` | 0 / 0 / 0 | 0 / 0 / 0 | kept as main; the link beneath found re-created |
| `twinunder` | 10 of 10 / 0 of 0 / 10 of 10 | 20 of 20 / 0 of 0 / 20 of 20 | Electron: landed on the re-rendered link (a lost click); CfT: nothing; Safari's main refused |

`stickyscroll` refuses `frameMoved` where the page scrolled the link from under the header: main's keep there reached nothing. `twinunder` is the fix's one cost that loses a landing: a genuine re-render under an overlay whose record holds same-label twins of the link beneath is refused `nodeGone` (#431's strict form, applied to the control beneath).

### 17942ad7: batches A, B and C

| Unit | cft: main | cft: fix | safari: main | safari: fix | electron: main | electron: fix |
|---|---|---|---|---|---|---|
| twincover/text | kept-missed sameElement 10 | refused nodeGone 10 [AXLink:none 10] | refused newElementOverPoint 10 | refused newElementOverPoint 10 | wrong-target sameElement 10 | refused nodeGone 10 [AXLink:none 10] |
| twincover/link | kept-missed sameElement 10 | refused nodeGone 10 [AXLink:none 10] | refused interactiveHit 10 | refused interactiveHit 10 | wrong-target sameElement 10 | refused nodeGone 10 [AXLink:none 10] |
| overcontrol/text | kept-missed sameElement 10 | kept-missed sameElement 10 [AXLink:handle 10] | kept-landed nonInteractiveHit 10 | kept-landed nonInteractiveHit 10 [AXLink:handle 10] | kept-landed sameElement 10 | kept-landed sameElement 10 [AXLink:handle 10] |
| overcontrol/link | kept-missed sameElement 10 | kept-missed sameElement 10 [AXLink:handle 10] | kept-landed recordedHit 10 | kept-landed recordedHit 10 | kept-landed sameElement 10 | kept-landed sameElement 10 [AXLink:handle 10] |
| scrim/text | kept-missed sameElement 10 | kept-missed sameElement 10 [AXLink:handle 10] | kept-missed sameElement 10 | kept-missed sameElement 10 [AXLink:handle 10] | kept-missed sameElement 10 | kept-missed sameElement 10 [AXLink:handle 10] |
| scrim/link | kept-missed sameElement 10 | kept-missed sameElement 10 [AXLink:handle 10] | kept-missed sameElement 10 | kept-missed sameElement 10 [AXLink:handle 10] | kept-missed sameElement 10 | kept-missed sameElement 10 [AXLink:handle 10] |
| decomove/text | wrong-target sameElement 10 | wrong-target sameElement 10 | refused nodeGone 10 | refused nodeGone 10 | wrong-target sameElement 10 | wrong-target sameElement 10 |
| decomove/link | wrong-target sameElement 10 | wrong-target sameElement 10 | refused nodeGone 10 | refused nodeGone 10 | wrong-target sameElement 10 | wrong-target sameElement 10 |

| Lane | Head | stalePoint.ms p50 / p95 / max (n), all | kept | refused | text point |
|---|---|---|---|---|---|
| cft | main | 1.803 / 8.509 / 30.581 (80) | 1.803 / 8.509 / 30.581 (80) | – | 1.962 / 16.295 / 29.082 (40) |
| cft | fix | 4.126 / 10.334 / 11.738 (80) | 2.532 / 9.891 / 11.738 (60) | 6.409 / 11.712 / 11.712 (20) | 4.804 / 11.712 / 11.738 (40) |
| safari | main | 3.017 / 10.971 / 12.361 (80) | 1.9 / 6.816 / 7.171 (40) | 5.192 / 11.758 / 12.361 (40) | 2.611 / 10.971 / 12.361 (40) |
| safari | fix | 2.754 / 9.339 / 10.993 (80) | 1.994 / 5.262 / 8.671 (40) | 4.763 / 10.362 / 10.993 (40) | 2.274 / 9.339 / 9.517 (40) |
| electron | main | 1.523 / 2.351 / 5.225 (80) | 1.523 / 2.351 / 5.225 (80) | – | 1.435 / 3.276 / 5.225 (40) |
| electron | fix | 2.181 / 8.23 / 10.178 (80) | 1.857 / 4.923 / 5.615 (60) | 7.441 / 10.178 / 10.178 (20) | 2.353 / 10.096 / 10.178 (40) |

| Run | Lane | Image | Browser | Rows | Abort | Gates failing |
|---|---|---|---|---|---|---|
| A2 | cft | 20261117.0516.1 | 157.0.8103.78 | 160/160 | none | overlayKept |
| A2 | electron | 20261117.0516.1 | Electron 44.4.5 / Chromium 152.0.7977.130 | 160/160 | none | none |
| A2 | safari | 20261117.0516.1 | 27.2 | 160/160 | none | none |

| Unit | cft: main | cft: fix | safari: main | safari: fix | electron: main | electron: fix |
|---|---|---|---|---|---|---|
| twin/text | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 |
| twin/link | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 |
| twincap/text | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 |
| twincap/link | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 |
| remount/text | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |
| remount/link | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |
| retext/text | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |
| retext/link | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |
| like/text | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |
| like/link | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |
| plain/text | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |
| plain/link | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |
| btnremount/link | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |
| tableremount/text | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |
| tableremount/link | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |
| tablecellremount/text | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |
| tablecellremount/link | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |
| nounder/link | kept-missed sameElement 10 | kept-missed sameElement 10 | kept-missed nonInteractiveHit 10 | kept-missed nonInteractiveHit 10 | kept-missed sameElement 10 | kept-missed sameElement 10 |
| rebuildunder/text | kept-missed sameElement 10 | kept-missed sameElement 10 [AXLink:recreated 10] | refused newElementOverPoint 10 | refused newElementOverPoint 10 | kept-landed sameElement 10 | kept-landed sameElement 10 [AXLink:recreated 10] |
| rebuildunder/link | kept-missed sameElement 10 | kept-missed sameElement 10 [AXLink:recreated 10] | kept-landed recordedHit 10 | kept-landed recordedHit 10 | kept-landed sameElement 10 | kept-landed sameElement 10 [AXLink:recreated 10] |
| bgbutton/text | kept-missed sameElement 10 | refused nodeGone 10 [AXButton:none 10] | kept-landed nonInteractiveHit 10 | refused nodeGone 10 [AXButton:none 10] | kept-landed sameElement 10 | refused nodeGone 10 [AXButton:none 10] |
| bgbutton/link | kept-missed sameElement 10 | refused nodeGone 10 [AXButton:none 10] | kept-landed recordedHit 10 | kept-landed recordedHit 10 | kept-landed sameElement 10 | refused nodeGone 10 [AXButton:none 10] |
| textbehind/text | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |
| textbehind/link | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |

| Lane | Head | stalePoint.ms p50 / p95 / max (n), all | kept | refused | text point |
|---|---|---|---|---|---|
| cft | main | 8.699 / 25.886 / 60.565 (240) | 10.23 / 26.573 / 60.565 (200) | 7.92 / 18.434 / 32.288 (40) | 13.031 / 28.23 / 60.565 (110) |
| cft | fix | 9.554 / 23.861 / 56.53 (240) | 12.686 / 24.222 / 56.53 (180) | 6.836 / 10.059 / 11.683 (60) | 12.686 / 25.157 / 56.53 (110) |
| safari | main | 5.312 / 11.398 / 16.672 (240) | 4.656 / 11.398 / 16.672 (190) | 6.614 / 10.921 / 13.111 (50) | 5.395 / 11.398 / 16.672 (110) |
| safari | fix | 5.53 / 11.204 / 17.243 (240) | 4.878 / 11.338 / 14.321 (180) | 6.619 / 10.803 / 17.243 (60) | 5.969 / 10.853 / 12.181 (110) |
| electron | main | 4.055 / 9.633 / 11.668 (240) | 2.734 / 9.555 / 11.668 (200) | 6.935 / 10.296 / 10.937 (40) | 4.904 / 9.637 / 11.668 (110) |
| electron | fix | 5.624 / 10.167 / 11.749 (240) | 5.183 / 9.9 / 11.749 (180) | 6.861 / 10.753 / 10.961 (60) | 5.983 / 10.27 / 11.542 (110) |

| Run | Lane | Image | Browser | Rows | Abort | Gates failing |
|---|---|---|---|---|---|---|
| B2 | cft | 20261117.0516.1 | 157.0.8103.78 | 480/480 | none | overlayKept |
| B2 | electron | 20261102.0473.1 | Electron 44.4.5 / Chromium 152.0.7977.130 | 480/480 | none | overlayKept |
| B2 | safari | 20261117.0516.1 | 27.2 | 480/480 | none | overlayKept |

| Unit | cft: main | cft: fix | safari: main | safari: fix | electron: main | electron: fix |
|---|---|---|---|---|---|---|
| wideoverlay/text | refused newElementOverPoint 10 | refused newElementOverPoint 10 | kept-missed nonInteractiveHit 10 | kept-missed nonInteractiveHit 10 | refused newElementOverPoint 10 | refused newElementOverPoint 10 |
| wideoverlay/link | refused newElementOverPoint 10 | refused newElementOverPoint 10 | kept-missed nonInteractiveHit 10 | kept-missed nonInteractiveHit 10 | refused newElementOverPoint 10 | refused newElementOverPoint 10 |
| stickyscroll/text | refused pressedOther 10 | refused frameMoved 10 [AXLink:handle 10] | kept-missed sameElement 10 | refused frameMoved 10 [AXLink:handle 10] | kept-missed nonInteractiveHit 10 | refused frameMoved 10 [AXLink:handle 10] |
| stickyscroll/link | refused interactiveHit 10 | refused interactiveHit 10 | kept-missed sameElement 10 | refused frameMoved 10 [AXLink:handle 10] | refused interactiveHit 10 | refused interactiveHit 10 |
| tipremount/text | kept-missed sameElement 10 | kept-missed sameElement 10 [AXLink:recreated 10] | refused newElementOverPoint 10 | refused newElementOverPoint 10 | kept-landed sameElement 10 | kept-landed sameElement 10 [AXLink:recreated 10] |
| tipremount/link | kept-missed sameElement 10 | kept-missed sameElement 10 [AXLink:recreated 10] | kept-landed recordedHit 10 | kept-landed recordedHit 10 | kept-landed sameElement 10 | kept-landed sameElement 10 [AXLink:recreated 10] |
| twinunder/text | kept-missed sameElement 10 | refused nodeGone 10 [AXLink:none 10] | refused newElementOverPoint 10 | refused newElementOverPoint 10 | kept-landed sameElement 10 | refused nodeGone 10 [AXLink:none 10] |
| twinunder/link | kept-missed sameElement 10 | refused nodeGone 10 [AXLink:none 10] | refused interactiveHit 10 | refused interactiveHit 10 | kept-landed sameElement 10 | refused nodeGone 10 [AXLink:none 10] |
| inbox/text | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 |
| inbox/link | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |
| reltime/text | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 |
| reltime/link | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |
| shrink/text | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 |
| shrink/link | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |
| linksave/text | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 |
| linksave/link | refused relabelled 10 | refused relabelled 10 | refused relabelled 10 | refused relabelled 10 | refused relabelled 10 | refused relabelled 10 |
| moved/text | refused frameMoved 10 | refused frameMoved 10 | refused nodeGone 10 | refused nodeGone 10 | refused frameMoved 10 | refused frameMoved 10 |
| moved/link | refused frameMoved 10 | refused frameMoved 10 | refused nodeGone 10 | refused nodeGone 10 | refused frameMoved 10 | refused frameMoved 10 |
| linkmono/text | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 |
| linkmono/link | refused relabelled 10 | refused relabelled 10 | refused relabelled 10 | refused relabelled 10 | refused relabelled 10 | refused relabelled 10 |
| right/text | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 |
| right/link | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |
| centre/text | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 |
| centre/link | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |

| Lane | Head | stalePoint.ms p50 / p95 / max (n), all | kept | refused | text point |
|---|---|---|---|---|---|
| cft | main | 4.22 / 8.487 / 16.126 (240) | 4.125 / 7.986 / 16.126 (90) | 4.227 / 8.487 / 10.427 (150) | 4.837 / 8.987 / 10.427 (120) |
| cft | fix | 5.504 / 10.042 / 13.462 (240) | 6.336 / 10.374 / 13.001 (70) | 4.516 / 9.954 / 13.462 (170) | 5.973 / 10.471 / 13.462 (120) |
| safari | main | 3.019 / 8.947 / 12.869 (240) | 1.549 / 6.653 / 12.869 (100) | 4.366 / 10.223 / 12.312 (140) | 4.183 / 10.459 / 12.869 (120) |
| safari | fix | 3.436 / 9.526 / 11.415 (240) | 2.122 / 6.806 / 10.57 (80) | 4.177 / 9.651 / 11.415 (160) | 4.229 / 10.156 / 11.415 (120) |
| electron | main | 2.206 / 8.746 / 23.683 (240) | 1.657 / 4.549 / 6.475 (100) | 3.356 / 9.792 / 23.683 (140) | 4.135 / 10.267 / 23.683 (120) |
| electron | fix | 3.868 / 9.284 / 11.085 (240) | 2.354 / 10.019 / 11.085 (70) | 4.274 / 9.025 / 10.637 (170) | 6.015 / 9.681 / 10.637 (120) |

| Run | Lane | Image | Browser | Rows | Abort | Gates failing |
|---|---|---|---|---|---|---|
| C2 | cft | 20261102.0473.1 | 156.0.8078.80 | 480/480 | none | none |
| C2 | electron | 20261102.0473.1 | Electron 44.4.5 / Chromium 152.0.7977.130 | 480/480 | none | none |
| C2 | safari | 20261102.0473.1 | 27.2 | 480/480 | none | none |

- **The regression: `bgbutton`.** A button behind the link (a later sibling at its depth, drawn below it) is the deepest recorded control under the overlay; removing it made 17942ad7 refuse `nodeGone` where main kept: Electron both points (20 of 20 kept-landed on main), Safari's text point (10 of 10), CfT both points. The final head keeps it (above).
- Everything else at parity: the keep cells (`remount`, `retext`, `plain`, `like`, `btnremount`, `tableremount`, `tablecellremount`, `textbehind`), `twin` and `twincap` (refused `nodeGone` on both heads), #340's cells and `wideoverlay`, row for row, reason included; batch C passes every gate on every lane. `twincover` refuses on CfT and Electron with the 905 sentence; `decomove` answers as main.
- `textbehind` needed a kit fix after [run 44722388282](https://github.com/SSFSKIM/cua/actions/runs/44722388282): its positioned text painted over the link, so the click reached it on both heads (`46bf0af6` draws it below).

### stalePoint.ms per head

p50 / p95 / max in ms over every valid row, then the text point alone (the link-text clicks, where the fix reads the parent chain):

| Head | Lane | All, main | All, fix | Text point, main | Text point, fix |
|---|---|---|---|---|---|
| 899c0e3b (confirmation) | cft | 2.6 / 18.0 / 22.3 | 6.4 / 21.2 / 24.0 | 2.4 / 18.0 / 22.3 | 7.5 / 22.1 / 24.0 |
| 899c0e3b (confirmation) | safari | 2.8 / 9.8 / 14.3 | 3.4 / 10.7 / 15.7 | 3.1 / 9.4 / 13.3 | 3.7 / 11.3 / 15.7 |
| 899c0e3b (confirmation) | electron | 1.5 / 6.9 / 9.3 | 3.2 / 8.9 / 10.4 | 1.6 / 7.9 / 9.3 | 4.6 / 9.1 / 10.4 |
| 17942ad7 (B: keep cells) | cft | 8.7 / 25.9 / 60.6 | 9.6 / 23.9 / 56.5 | 13.0 / 28.2 / 60.6 | 12.7 / 25.2 / 56.5 |
| 17942ad7 (B: keep cells) | safari | 5.3 / 11.4 / 16.7 | 5.5 / 11.2 / 17.2 | 5.4 / 11.4 / 16.7 | 6.0 / 10.9 / 12.2 |
| 17942ad7 (B: keep cells) | electron | 4.1 / 9.6 / 11.7 | 5.6 / 10.2 / 11.7 | 4.9 / 9.6 / 11.7 | 6.0 / 10.3 / 11.5 |
| 17942ad7 (C: #340's cells) | cft | 4.2 / 8.5 / 16.1 | 5.5 / 10.0 / 13.5 | 4.8 / 9.0 / 10.4 | 6.0 / 10.5 / 13.5 |
| 17942ad7 (C: #340's cells) | safari | 3.0 / 8.9 / 12.9 | 3.4 / 9.5 / 11.4 | 4.2 / 10.5 / 12.9 | 4.2 / 10.2 / 11.4 |
| 17942ad7 (C: #340's cells) | electron | 2.2 / 8.7 / 23.7 | 3.9 / 9.3 / 11.1 | 4.1 / 10.3 / 23.7 | 6.0 / 9.7 / 10.6 |

The fix adds up to 5 ms at p50 (most on CfT's confirmation, whose kept overlay rows run the check: 6.4 against 2.6) and little at p95; the largest maximum is 56.5 ms on CfT (main's 60.6, both on `twincap`'s 6,000-node page, which also lifts batch B's CfT figures on both heads). The confirmation's text-point rows are overlay and keep cells; the full link-text keep set is in batch B, on 17942ad7; the final head was confirmed on `retext`, `plain` and `remount`.

### Superseded head d514da6f: batch B

[Run 44722388282](https://github.com/SSFSKIM/cua/actions/runs/44722388282), 480 rows per lane, all valid: the keep cells at parity; `bgbutton` refused `nodeGone` where main kept (the regression 17942ad7 kept); `textbehind` unusable on both heads (the kit's fault, fixed in `46bf0af6`).

## Superseded head 2a1b0368: batch A

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

## #443 qual

Branch `probe/443-qual`, from `probe/433-qual` (`405cbb05`), workflow `probe-443-qual.yml` (artifacts `probe-443-<lane>-<mode>`). #443 (`fix/443-decoration-control-gone`): the guard refuses (`controlGone`) a point #296 keeps on an inert node found by its own handle, not #305's `recordedHit`, whose recorded control (`ScreenshotNode.control`) answers `kAXErrorInvalidUIElement`. This kit qualifies it main against fix on `decomove`, a role-change cell, #433's cells and #340's.

```sh
# Three batches, one in flight at a time, each lane under 500 rows (10 per head per unit).
gh workflow run probe-443-qual.yml --ref probe/443-qual -f main="$MAIN_SHA" -f fix="$FIX_SHA" -f mode=qualify -f reps=10 -f cells=twincover,overcontrol,scrim,decomove,rolechange,stickyscroll,tipremount,twinunder
gh workflow run probe-443-qual.yml --ref probe/443-qual -f main="$MAIN_SHA" -f fix="$FIX_SHA" -f mode=qualify -f reps=10 -f cells=nounder,rebuildunder,bgbutton,textbehind,twin,twincap,remount,retext,plain,like,btnremount,tableremount,tablecellremount
gh workflow run probe-443-qual.yml --ref probe/443-qual -f main="$MAIN_SHA" -f fix="$FIX_SHA" -f mode=qualify -f reps=10 -f cells=inbox,reltime,shrink,linksave,moved,linkmono,right,centre,wideoverlay
# The README's tables from a run: gh run download <id> -D <dir>; node scripts/probe-433/tables.mjs <dir> <label>
```

What #443 changes in #433's kit:
- **`decomove` is gated** (no longer report only): in `overlayTwin` (no fix row reaches B or anything else) and in a new gate, `decoGone`: every fix row whose paired main row kept must be refused `controlGone`, and where main refused (Safari's `nodeGone`) the fix answers as main, reason included. Beside it, `decoGone.elsewhere` counts any other cell's fix rows refused `controlGone` (`elsewhereLanded`: of those, the ones whose main row kept and landed, a false refusal).
- **`rolechange`** (kind keep, gate `overlayKept`): the same inert decoration inside link A (`page.mjs` `deco`), and `mark` sets `role="button"` on A's own element: the DOM element, its box and its label stay, so a click lands on A. Chromium re-creates an element's accessibility object when its role changes; if the decoration's object survives that, the fix's named limit (a control re-created for the same DOM element) shows here as a `controlGone` refusal main does not make.
- Every row records the fix's `stalePoint.controlRole` (the gone control's role, set on `controlGone` only); `report.mjs` tabulates it (`Control gone`), and `tables.mjs` prints the tables below (a fix cell's `[AXLink n]` is that role).
