# #433: hosted macOS evidence for a click recorded on a click-through overlay

Every run happened only on GitHub-hosted macOS, in kit `probe/433-qual` (workflow `424823141`, kit `46bf0af6`). The kit's README, `scripts/probe-433/README.md` at `405cbb05`, has every table, each labelled with its head. Engines were built unmodified from exact SHAs. The lanes were Chrome for Testing, Safari 27.2 and Electron 44.4.5, each run in the background behind an owned cover window. Main is `870dd117`, and the final fix is `899c0e3b`. Every row of every run was valid, and on every overlay row the record held the overlay (an inert `AXGroup`) at the point.

## The bug on main

Cell `twincover`: a transparent `pointer-events: none` group lies over link A. A is removed, and a same-label link B slides into its place. The observation recorded the overlay at the point, which is alive and in place, so main keeps the click.

| Lane | Main |
|---|---|
| Electron | lands on B every row, at both the text point and the link point |
| Safari | refused (`newElementOverPoint` at the text point, `interactiveHit` at the link point): Safari's hit test sees through the overlay, so the bug doesn't arise there |
| Chrome for Testing | keeps the click but posts nothing (`backgroundClickRefused`): in shared mode, CfT's element route would press the overlay group and refuses instead, so no click reaches B, or A in the unchanged case |

## The fix and the final head

When the recorded node at the point is inert, with no acting ancestor (framed or frameless) up to its document boundary, and the hit names no control, the guard also vouches for the recorded controls under the overlay. It keeps the click if any of them is still there: alive on its own handle, in place and unrelabelled, or re-created in a form #431 accepts. It refuses only when none is. The refusal sentence names the situation (design ruling 905).

## Results on the final head `899c0e3b`

- [Confirmation run 44748267096](https://github.com/SSFSKIM/cua/actions/runs/44748267096) and [cost cells 44751491715](https://github.com/SSFSKIM/cua/actions/runs/44751491715), with heads interleaved, 5 rows per head per unit.
- **`twincover`:** refused `nodeGone` on CfT and Electron, 5 of 5 at each point, and the click never reaches B. Safari refused on both heads, with main's reasons.
- **The refusal sentence**, the same on all 20 refused rows: "The screen changed since the screenshot: the point lies on an AXGroup that does not act on its own, over the AXLink "Inbox" the screenshot showed there, which a click passes through to; that control is gone or was replaced. Nothing was sent. Call getScreenshot for a new screenshot and aim again from what it shows; the same point would reach whatever lies under the AXGroup now."
- **At parity with main** (verdict and reason, row for row, every lane, nothing reached that main didn't reach): `overcontrol` (an overlay over an unchanged link), `scrim` (a click-catching backdrop, ruling 903), `bgbutton` (an unrelated button removed behind an unchanged link), `rebuildunder` (the link's list rebuilt in place), `retext`, `plain` and `remount`.
- **`decomove`** (a decoration moved from a replaced link into its replacement) answers as main does, including main's wrong click on CfT and Electron. It is out of scope and tracked as #443.

## The ordinary-click regression set, on `17942ad7`

- [Batch A](https://github.com/SSFSKIM/cua/actions/runs/44729764268), [batch B](https://github.com/SSFSKIM/cua/actions/runs/44733158011) and [batch C](https://github.com/SSFSKIM/cua/actions/runs/44740480524), 10 rows per head per unit. `17942ad7` is the narrowed head before the last two gate commits.
- **At parity with main:** `remount`, `retext`, `plain`, `like`, `btnremount`, `tableremount`, `tablecellremount`, `textbehind`, `twin`, `twincap`, `nounder`, `rebuildunder`, #340's eight cells and `wideoverlay`. There were 0 new refusals and no wrong target on the fix.
- **One regression, `bgbutton`, fixed by the final head.** The fix picked the removed later-sibling button over the unchanged link.
- **Why these cells weren't rerun on the final head:** the final head's two commits change only the overlay gate and the choice of control under an overlay. A click whose recorded node has an acting ancestor never reaches either, so these cells don't depend on them.

## Cost (ruling 905)

New refusals where main kept, out of the rows main kept, on the final head:

| Cell | CfT | Safari | Electron | Note |
|---|---|---|---|---|
| `stickyscroll` (a link scrolled away under a fixed inert header) | 0 / 0 | 10 / 10 | 5 / 5 | refused `frameMoved`; main's keep reached nothing, because the header ate the click |
| `tipremount` (a link re-rendered under a tooltip layer) | 0 | 0 | 0 | |
| `twinunder` (a re-rendered link among same-label links under an overlay) | 10 / 10 | 0 / 0 | 10 / 10 | the only cost that loses a landing: #431's strict form refuses because the record holds twins |

`stalePoint.ms` p50, main against fix, on the final head: CfT 2.6 against 6.4, Safari 2.8 against 3.4, Electron 1.5 against 3.2. p95 rises by at most about 3 ms.

## Limits

- **Only Electron reproduces #433.** On CfT, main never posts under an overlay. On Safari, main already refuses.
- **Stacking isn't visible.** The check vouches for the recorded controls under the overlay, not for which one is on top. A control sliding over a live target, and overlapping siblings, are tracked as #442.
- **Kit review:** the kit was reviewed up to `8889faff`. The cells added later were checked only by their smoke runs.
