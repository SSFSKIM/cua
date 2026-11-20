# #433 hosted qualification: a click recorded on a click-through overlay lands on a different control under it

A disposable hosted macOS kit, not product code, built from `probe/435-qual` (`d7052b79`, workflow `probe-435-qual.yml`, id 424694563; its README holds the harness, #435's discovery and its regression set on main `f8f34652`), itself built from #431's kit (`probe/431-qual`, `3f97d533`). #433: when the observation's record holds a non-interactive overlay at the click point, the stale-point guard finds it alive and in place and keeps the click, which passes through the overlay to whatever control lies under it now. The fix (`fix/433-overlay-target`) makes the guard also vouch for the recorded interactive node under the overlay. This kit qualifies it main against fix on `twincover` at both points, three control cells and #431's regression set.

```sh
gh workflow run probe-433-qual.yml --ref probe/433-qual -f main="$MAIN_SHA" -f mode=smoke -f cells=twincover,overcontrol,scrim,nounder
gh workflow run probe-433-qual.yml --ref probe/433-qual -f main="$MAIN_SHA" -f fix="$FIX_SHA" -f mode=qualify -f reps=20 -f cells=twincover,overcontrol,scrim
```

What #433 adds to #435's kit:
- **The overlay** (`page.mjs` `cover`): a group with role `group`, nested two groups below the target's row (each layer `position: absolute` over the row), so it lies deeper in the accessibility tree than the link's text and the record (StalePoint.swift `deepestScreenshotNode`: the deepest recorded node whose shown frame holds the point) takes it at the text point as well as the link point. #431's `twincover` laid it as the link's sibling, so the record held it at the link point only. Placement (`nodeAt`) must find an AXGroup at the point, else the row is invalid (`placement`); `score`'s `misplaced` compares the guard's `recordedRole` with AXGroup (`cells.mjs` `records`).
  - `veil`: over the row, `pointer-events: none` on every layer, so a click goes through to what lies under it.
  - `scrim` (ruling 903): over the row with no pointer-events rule and no interactive role, so it catches the click.
  - `beside`: a veil 240 px wide laid 20 px past the target's right edge, over nothing interactive.
- **Cells**:
  - `twincover` (kind twin, `veil`, both points): link A under the veil; after the observation A is removed and a same-label link B, alive in the second row, moves up into its place. Main keeps the live overlay (`sameElement`), and where the click is posted as events it falls through to B.
  - `overcontrol` (kind keep, `veil`, both points): the veil over link A and nothing changes.
  - `scrim` (kind asMain, `scrim`, both points): the scrim over a live, unchanged link A; on main the scrim eats the click.
  - `nounder` (kind asMain, `beside`, the link point only, aimed 60 pt past the link's right edge): the veil with nothing interactive under it, nothing changing.
- **Gates** (`check.mjs` `gates`, qualify only):
  - `overlayTwin`: no valid fix row of `twincover` reaches B or any other control (A is gone). How many refused, and why, is reported beside (`refused`, `perUnit`); a keep that reaches nothing passes the gate and is reported.
  - `overlayKept`: `overcontrol` kept and landed on A on every valid fix row, as main row for row, reason included.
  - `overlayAsMain`: `scrim` and `nounder` as main row for row, reason included.
  - Every paired gate (`keptAsMain`, `othersAsMain`, the two above) now fails on a different guard reason too (#435's counted it only), and on any fix row whose click reached a control, the target included, that no valid main row of its unit reached (`reachBeyondMain`).
  - `reproduced` is reported only: per `twincover` unit, main's valid rows that kept the click and logged a click on B. On Chrome for Testing the shared-mode element route presses the overlay itself and posts no event (#431's run 44642664004: `backgroundClickRefused`), so main reaches nothing there.
  - Unchanged: `coverage`, `twinRefused` (now without `twincover`), `twinUnrecorded`, `noWrongTarget`, `presentation`, `guardMs`; #435's `twinFrameless` has no unit in these runs.
- **Report** (`report.mjs <dir>`, from `gh run download <id> -D <dir>`): per unit and head, what the record held (`recordedRole`), the hit, and the controls the click reached, beside #435's columns; `stalePoint.ms` per head.

The harness (heads, lanes, presentation under the owned cover, setup checks, per-trial evidence, the keep, twin and #340 cells) is #435's, as its README describes.
