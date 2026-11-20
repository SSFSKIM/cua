# #431: hosted macOS evidence for a same-label control that takes a removed control's place

Every run happened only on GitHub-hosted macOS, in kit `probe/431-qual` (workflow `423762603`, kit `622b041d` for the final runs). Engines were built unmodified from clean checkouts of exact SHAs. The kit's README, `scripts/probe-431/README.md` at `3f97d533`, has every table and every smoke. The lanes were Chrome for Testing 156/157, Safari 27.2 and Electron 44.4.5, each run in the background behind an owned cover window. Main is `1e56ca40` throughout; the fix is the final head `90282060`.

## The bug on main

Cell `twin`: two links labelled "Inbox" with different destinations. The first is removed and the second slides up into its place at the same frame. Main's re-created match (#296) accepts any node with the same role, a frame within 2 pt and an agreeing label. **On every lane, every valid main row in every twin cell clicked the other control**: `twin`, `twinbtn` (buttons), `twindel` (a list of "Delete" links), `twincap` (the twin past the walk's node cap), `twindeep` (the twin below the depth cap), `twinrow` (the twin's row moves up with the link re-rendered), `twincover` at the text, and `twinwide` (the twin outside the visible subset of a wide list; Safari only, because Chromium reads the 151-child group whole).

## Why the fix is a strict rule, not a novelty proof

The first build (`3ece1a1a`) required the candidate to be new to the observation's record. Chrome for Testing and Electron then refused the twins, but **Safari still clicked them**. The kit moves the twin in the DOM, and WebKit gives a moved element new accessibility handles, so to the tree a moved control looks the same as a re-created one. Design ruling 889 therefore chose the strict form. A re-created candidate is refused when any of the following holds:
- the record holds another element of the node's role whose label agrees;
- the node's web area wasn't recorded whole, judged by child-handle membership on the node's own ancestors;
- a control read failed;
- the recorded node or its control is still alive;
- the candidate's nearest control differs from the recorded one.

## Phase 2: main `1e56ca40` against fix `90282060`

There were five final runs, executed one at a time, with heads interleaved and at least 20 valid rows per head for each unit and lane:
- [twins](https://github.com/SSFSKIM/cua/actions/runs/44642664004)
- [twincap](https://github.com/SSFSKIM/cua/actions/runs/44652645283)
- [keeps and big pages](https://github.com/SSFSKIM/cua/actions/runs/44655103884)
- [#340 cells and wideoverlay](https://github.com/SSFSKIM/cua/actions/runs/44662856178)
- [top-up](https://github.com/SSFSKIM/cua/actions/runs/44671401657)

| Group | Main | Fix |
|---|---|---|
| Twin cells (above), at the text and at the control | wrong target on every row | refused `nodeGone` on every row, all three lanes |
| `twinswap`, `twinswapbtn` (the target moves away on its own handle; a new same-label control appears in its place) | refused `frameMoved` | refused `frameMoved` |
| Genuine re-creation: `remount`, `retext`, `plain`, `like` (#298's linklike), `btnremount` (#296's re-created button), `tableremount`, `tablecellremount` (Chromium lists table cells twice) | kept and landed | kept and landed, every row |
| #340's cells (`inbox`, `reltime`, `shrink`, `right`, `centre`, `linksave`, `linkmono`, `moved`) | phase 1's answers | the same answer and reason, every pair |
| `wideoverlay` (#330's wide parent with a new overlay) | `newElementOverPoint` on Chromium; on Safari the click was kept and hit the overlay | the same |

| Lane | Valid rows, main / fix | Wrong targets on the fix | `stalePoint.ms` p50 / p95, fix vs main |
|---|---|---|---|
| Chrome for Testing | 1104 / 1103 | 0 | 6.3 / 25.0 vs 8.1 / 27.5 |
| Safari | 1080 / 1080 | 0 | 4.9 / 13.3 vs 4.6 / 12.6 |
| Electron | 1110 / 1112 | 0 | 4.8 / 11.5 vs 4.4 / 10.7 |

### The cost (ruling 889's accepted trade)

The table counts pairs where main kept the click and landed it, and how many of those the fix refused.

| Lane | Fix refused / main kept | Where |
|---|---|---|
| Chrome for Testing | 40 / 419 | all in `capremount` |
| Safari | 80 / 440 | `capremount` 40/40, `wideremount` 40/40 |
| Electron | 40 / 420 | all in `capremount` |

Every refusal is a genuine re-render inside a container the record could not hold whole: the node cap ended the walk inside it, or the width rule read only the visible children. The answer is `nodeGone` with nothing clicked, so the agent observes again. Every other cell that main kept had zero refusals.

## Limits

- **#433, a click-through overlay.** `twincover` at the control point records the live transparent overlay itself, not a re-created node. On Electron both heads keep the click, and it falls through to the twin (22/22). Safari's fix refuses it as `interactiveHit`, and Chrome for Testing records another node there. This is a separate mechanism, tracked as #433, and was reported only, not gated (ruling 890).
- **Lists of same-label controls.** A genuine re-creation on a page that holds another element of the same role with an agreeing label (several "Reply" links, or unlabelled buttons) is refused. The kit has no cell measuring how often this happens on real pages.
- **Frameless twins.** The same-label refusal reads only the record's framed nodes. Links and buttons always read a frame on the measured browsers. This is logged in `tech-debt-tracker.md`.
- **Setup stalls.** Four Chrome for Testing and Electron jobs stopped after 525 to 697 rows, when a page stopped answering. These were setup faults, not product results, and the top-up run filled the gap. Safari never stalled.
