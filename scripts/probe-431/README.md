# #431 hosted measurement and qualification: a same-label control taking a removed control's place under #296's stale-point guard

A disposable hosted macOS kit, not product code, built from `probe/340-qual` (`85524063`, workflow `probe-340-qual.yml`, id 423661274; its README holds #340's phase 1 on main `1e56ca40`). It measures, on GitHub-hosted macOS, how #296's stale-point guard answers a coordinate click when the control the screenshot showed at the point is removed and a different control with the same label takes its place (#431: main's re-created match accepts it by role, frame and label, and the click lands on the other control), and qualifies the #431 fix against main, with #340's cells kept as the regression set. The harness is #340's: exact-SHA stock builds, the owned cover and #395's activation witness, the long-poll fixture server, one engine connection per trial.

```sh
gh workflow run probe-431-qual.yml --ref probe/431-qual -f main="$MAIN_SHA" -f mode=smoke                          # one trial per unit, main alone
gh workflow run probe-431-qual.yml --ref probe/431-qual -f main="$MAIN_SHA" -f fix="$FIX_SHA" -f mode=qualify      # twenty per unit per head, interleaved
gh workflow run probe-431-qual.yml --ref probe/431-qual -f main="$MAIN_SHA" -f cells=twincap,twindeep              # some cells only
```

- **Heads, lanes, presentation, setup checks, per-trial evidence**: as #340's kit (`probe/340-qual`'s README): Chrome for Testing, Safari and Electron 44.4.5, each in the background under the owned cover, frontmost only when the background could not be set up before any cua call; a setup failure before the click is an invalid row with its step, never a product miss.
- **The page** (`page.mjs`): three rows of 64 px, the target, then Archive and Drafts, rebuilt at every prepare (rows and controls), each control `display:inline-block` with 32 px of side padding. Every pointer event is logged with the control it reached; any event on a control other than the target is a wrong target.
- **Cells** (`cells.mjs`), each applied by `mark` after the observation and 500 ms before the click:
  - **twin** (the fix must refuse `nodeGone` and never land on the other control; main lands on it):
    - `twin`: two "Inbox" links with different destinations; the target is removed and the second is moved up into its row (#340's cell);
    - `twinbtn`: the same with two buttons; a button exposes no text child, so only the control point is planned;
    - `twindel`: three identical "Delete" links in a list; the target's row is removed and the next row reflows up into its place (its handle kept, only its frame moved);
    - `twincap` (ruling 881): the second "Inbox" link sits after a filler of 6,000 texts in 60 groups of 100, below the fold, so the walk (which reads what the window shows first, the rest in the document's order) reaches its 4,000-node cap before the twin; then it is moved into the target's row;
    - `twindeep` (ruling 881): the second "Inbox" link sits under 220 nested groups in the second row, below the walk's 200-level depth cap (and within the guard's 300-level ancestor walk); the target is removed and the chain is moved up into its row.
    - the coordinator's second set (the fix review's holes): `twinswap` and `twinswapbtn` (the target moved two rows down on its own element, absolutely, while a new link, resp. button, with its label appears at its old place; a moved handle's `frameMoved` counts with `nodeGone`), `twincover` (as `twin`, under a transparent group laid over the target's row that survives the change), `twinrow` (the rows are groups; the target's row is removed and the twin's row, alive, moves up with the twin re-rendered in it), `twinwide` (150 list rows placed so that the target's row is the last the window shows and the twin's, the next, the first it does not; the observation must show the width rule's visible subset and the label on the target alone; gated with the unrecorded twins). Carriers expected: 1 for the swap cells and `twinwide`, 2 for `twincover` and `twinrow`. Browser controls above the target's row (Chrome for Testing's infobar link) are left out of the AXLink check.
    Every twin cell's observation must hold exactly the label's carriers it prepares (AXStaticTexts for links, AXButtons for buttons: 2 for `twin` and `twinbtn`, 3 for `twindel`, 1 for the last two), so the control found is the target and never the next row, else the row is invalid (`uncovered`). For the last two the observation must also show the walk cut where the cell says (`truncated.count` with `timings.nodeCapHit`, not a deadline cut; resp. `truncated.depth`), no node reading the label outside the target's own frame, and no AXLink but the target and Archive, framed or not (a twin read without its label still counts), else `uncovered`: the twin is then absent from the record (the guard's record-only reads take only children the window shows, which neither twin is). For `twincap` the region and the twin's row are groups of their own, so neither is flattened into a sibling read before the filler.
  - **keep** (genuine re-creation, kept and landed on main; the fix must answer as main): `remount` (the link re-rendered whole with the same label and destination at the same place, a React-style key remount), `retext` (the link's text element, a span, re-created in place), `plain` (the same text re-created through `textContent`), `like` (a same-width count, #298's linklike), `btnremount` (#296's re-created button: an "Again" button re-rendered whole, control point only).
  - **big** (the builder's question, reported as `bigPage`, never part of the pass): the link re-rendered whole inside a container the record cannot hold whole, where the fix, which takes a re-created handle only under a recorded ancestor with every child recorded, may refuse a genuine re-creation: `wideremount` (the target first of 151 links running past the window, so the width rule reads the visible subset; the observation must show a node `shown` fewer children than it has) and `capremount` (the target first of a container of 59 shown groups of 100 small texts, so the node cap ends the walk inside it; the observation must show `nodeCapHit`). Else the row is invalid (`uncovered-cut`).
  - **ruling 891's groups**: `wideoverlay` (asMain: #330's wide parent, the target first of 151 links in one group; after the observation a new child of that group, a text "Suggestion" over the target, takes the point, so the verdict is main's, `newElementOverPoint` where the record holds the parent with every child), `tableremount` and `tablecellremount` (keep: a data table with a header row, whose cells Chromium lists under both its rows and its columns, beside the link re-rendered whole, or holding it in its first cell).
  - **asMain** (#340's regression set; the fix must answer as main): `inbox`, `reltime`, `shrink`, `right` and `centre` (refused at the text on main, kept at the link), `linksave`, `linkmono`, `moved`. #340's `badge`, `content` and `arrow` are left out.
- **Points** (`at`): `text`, inside the control's AXStaticText near its start; `link`, 6 pt inside the control's left edge, in its padding, so the record holds the control (AXLink, or AXButton for `twinbtn`). Placement is checked from the observation before the click.
- **Verdicts**: #340's (`check.mjs` `score`), first match `wrong-target`.
- **Per trial**, beside #340's evidence: what the observation's walk read (`walk`: nodes emitted, nodes cut, the depth cut, whether the node cap stopped it) and where the twin ended against the target's place (`dom.twin`, CSS px).

**Gates** (`check.mjs` `gates`, qualify only; smoke and measure pass on coverage alone): `coverage` (every planned row ran, every unit of every head at least 80% valid); `reproduced` (the page logged a `click` on the twin itself on at least half main's valid `twin` rows; failing it is an inconclusive run); `twinRefused` (every valid fix row of `twin`, `twinbtn`, `twindel` refused with `nodeGone`, nothing reaching the target or another control) and `twinUnrecorded` (the same for `twincap`, `twindeep`), each with per-unit tallies of both heads; `keptAsMain` (every fix row of the keep cells the verdict of its paired main row, at least 10 usable pairs per unit, and every valid fix row but a failed observation `kept-landed`, so two heads refusing alike still fail; reports `fixNotKept`, `refusedWhereMainKept` and, apart, `mainNotKept`, an unusable baseline); `othersAsMain` (the same for the asMain cells; a different refusal reason alone is counted, not failed); `noWrongTarget` (no fix row anywhere a wrong target, and no invalid fix row whose captured page log holds an event on another control, `invalidRowsWithWrongEvents`; main's per unit reported); `presentation` (per unit, no more fix rows than main's on which something other than the cover activated). `bigPage` reports the big cells with `keptAsMain`'s measure and is never part of the pass; `guardMs` reports `stalePoint.ms` per head (all rows and the twin rows) and is never part of the pass; `report.mjs` gives it per unit and head as p50 / p95 / max. A run of some cells (`cells`, own cell names only, never an empty selection) is judged on those cells alone.

`report.mjs <dir>` prints the tables from a downloaded run (`gh run download <id> -D <dir>`).

## Runs

Workflow `probe-431-qual.yml`, id `423762603`, [registration](https://github.com/SSFSKIM/cua/actions/runs/44517027004) (Ubuntu only). Main `1e56ca404f6acac2d76f4e0d32019a63d90b4276` throughout; the final #431 head `90282060d082c14c5b0e006d1b1ac26067097e42` (ruling 889's strict form, the role check, and the last wave's `.noValue` keep-path fix). Hosted macOS images `20261102.0473.1`, `20261112.0504.1` and `20261117.0516.1`; Chrome for Testing 156.0.8078.80 and 157.0.8103.78, Safari 27.2, Electron 44.4.5 / Chromium 152.0.7977.130. Every lane ran in the background under the cover, the witness held on every row.

| Run | Kit | Head(s) | What it established |
|---|---|---|---|
| [Smoke](https://github.com/SSFSKIM/cua/actions/runs/44518499843) | `49bdbde2` | main | Every first-set cell on main: every twin a wrong target; #340's cells as phase 1; CfT's twincap/twindeep invalid (the browser's own infobar link counted as a twin, fixed in `d9cc5357`). |
| [Smoke](https://github.com/SSFSKIM/cua/actions/runs/44520748737) | `52e56fad` | main, 3ece1a1a | 3ece1a1a still clicked the twin on Safari (`twin`, `twincap`, `twindeep`), refused on Chromium; the big-page re-creations refused by the fix. |
| [Smoke](https://github.com/SSFSKIM/cua/actions/runs/44521677002) | `19f2491d` | main | The second twin set on main: `twinrow`, `twincover` wrong targets, the swap cells refused `frameMoved`. |
| [Smoke](https://github.com/SSFSKIM/cua/actions/runs/44632050254) | `622b041d` | main | Ruling 891's cells on main: `wideoverlay` refused `newElementOverPoint` on Chromium and kept-missed on Safari; both table cells kept and landed. |
| [Twins](https://github.com/SSFSKIM/cua/actions/runs/44611947576), [keeps](https://github.com/SSFSKIM/cua/actions/runs/44611952010) | `0232f2f5` | main, 714be3b0 | Superseded by the final head; Chromium twins aborted at rep 15 (setup). |
| [Final: twins](https://github.com/SSFSKIM/cua/actions/runs/44642664004) | `622b041d` | main, 90282060 | Safari complete; CfT and Electron aborted after 525 and 531 rows (setup, below). |
| [Final: twincap](https://github.com/SSFSKIM/cua/actions/runs/44652645283) | `622b041d` | main, 90282060 | Complete, every gate. |
| [Final: keeps and big pages](https://github.com/SSFSKIM/cua/actions/runs/44655103884) | `622b041d` | main, 90282060 | Complete, every gate. |
| [Final: #340 cells and wideoverlay](https://github.com/SSFSKIM/cua/actions/runs/44662856178) | `622b041d` | main, 90282060 | Safari complete; CfT and Electron aborted after 688 and 697 rows (setup). |
| [Final: top-up](https://github.com/SSFSKIM/cua/actions/runs/44671401657) | `622b041d` | main, 90282060 | CfT and Electron, five more per head of every unit the two aborted runs left short: complete, every gate. |

## Phase 2: main against the final head

The tables join the five final runs (valid rows per head; each unit has at least 20 valid rows per head on every lane). A row's verdict is followed by the guard's reason where it refused or kept other than by landing.

| Unit | Gate | cft: main | cft: fix | safari: main | safari: fix | electron: main | electron: fix |
|---|---|---|---|---|---|---|---|
| twin/text | twin | wrong-target sameElement 23 | refused nodeGone 23 | wrong-target sameElement 20 | refused nodeGone 20 | wrong-target sameElement 23 | refused nodeGone 23 |
| twin/link | twin | wrong-target sameElement 23 | refused nodeGone 23 | wrong-target sameElement 20 | refused nodeGone 20 | wrong-target sameElement 23 | refused nodeGone 23 |
| twinbtn/link | twin | wrong-target sameElement 23 | refused nodeGone 23 | wrong-target sameElement 20 | refused nodeGone 20 | wrong-target sameElement 23 | refused nodeGone 23 |
| twindel/text | twin | wrong-target sameElement 23 | refused nodeGone 22 (1 invalid) | wrong-target sameElement 20 | refused nodeGone 20 | wrong-target sameElement 23 | refused nodeGone 23 |
| twindel/link | twin | wrong-target sameElement 22 (1 invalid) | refused nodeGone 22 (1 invalid) | wrong-target sameElement 20 | refused nodeGone 20 | wrong-target sameElement 23 | refused nodeGone 23 |
| twincap/text | twin | wrong-target sameElement 20 | refused nodeGone 20 | wrong-target sameElement 20 | refused nodeGone 20 | wrong-target sameElement 20 | refused nodeGone 20 |
| twincap/link | twin | wrong-target sameElement 20 | refused nodeGone 20 | wrong-target sameElement 20 | refused nodeGone 20 | wrong-target sameElement 20 | refused nodeGone 20 |
| twindeep/text | twin | wrong-target sameElement 22 (1 invalid) | refused nodeGone 22 (1 invalid) | wrong-target sameElement 20 | refused nodeGone 20 | wrong-target sameElement 23 | refused nodeGone 23 |
| twindeep/link | twin | wrong-target sameElement 22 (1 invalid) | refused nodeGone 22 (1 invalid) | wrong-target sameElement 20 | refused nodeGone 20 | wrong-target sameElement 22 (1 invalid) | refused nodeGone 23 |
| twinswap/text | twin | refused frameMoved 22 (1 invalid) | refused frameMoved 22 | refused frameMoved 20 | refused frameMoved 20 | refused frameMoved 22 (1 invalid) | refused frameMoved 22 (1 invalid) |
| twinswap/link | twin | refused frameMoved 22 | refused frameMoved 22 | refused frameMoved 20 | refused frameMoved 20 | refused frameMoved 22 (1 invalid) | refused frameMoved 22 (1 invalid) |
| twinswapbtn/text | twin | refused frameMoved 22 | refused frameMoved 22 | refused frameMoved 20 | refused frameMoved 20 | refused frameMoved 22 (1 invalid) | refused frameMoved 22 (1 invalid) |
| twinswapbtn/link | twin | refused frameMoved 22 | refused frameMoved 22 | refused frameMoved 20 | refused frameMoved 20 | refused frameMoved 22 | refused frameMoved 22 (1 invalid) |
| twincover/text | twin | wrong-target sameElement 22 | refused nodeGone 22 | wrong-target sameElement 20 | refused nodeGone 20 | wrong-target sameElement 22 | refused nodeGone 22 |
| twincover/link | report only (#433) | misplaced sameElement 22 | misplaced sameElement 22 | wrong-target recordedHit 20 | misplaced interactiveHit 20 | wrong-target sameElement 22 | wrong-target sameElement 22 |
| twinrow/text | twin | wrong-target sameElement 22 | refused nodeGone 22 | wrong-target sameElement 20 | refused nodeGone 20 | wrong-target sameElement 22 | refused nodeGone 22 |
| twinrow/link | twin | wrong-target sameElement 22 | refused nodeGone 22 | wrong-target sameElement 20 | refused nodeGone 20 | wrong-target sameElement 22 | refused nodeGone 22 |
| twinwide/text | twin | – | – | wrong-target sameElement 20 | refused nodeGone 20 | – | – |
| twinwide/link | twin | – | – | wrong-target sameElement 20 | refused nodeGone 20 | – | – |
| remount/text | keep | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 |
| remount/link | keep | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 |
| retext/text | keep | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 |
| retext/link | keep | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 |
| like/text | keep | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 |
| like/link | keep | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 |
| plain/text | keep | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 |
| plain/link | keep | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 |
| btnremount/link | keep | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 |
| wideremount/text | big (cost) | – | – | kept-landed 20 | refused nodeGone 20 | – | – |
| wideremount/link | big (cost) | – | – | kept-landed 20 | refused nodeGone 20 | – | – |
| capremount/text | big (cost) | kept-landed 20 | refused nodeGone 20 | kept-landed 20 | refused nodeGone 20 | kept-landed 20 | refused nodeGone 20 |
| capremount/link | big (cost) | kept-landed 20 | refused nodeGone 20 | kept-landed 20 | refused nodeGone 20 | kept-landed 20 | refused nodeGone 20 |
| wideoverlay/text | as main | refused newElementOverPoint 24 (1 invalid) | refused newElementOverPoint 24 (1 invalid) | kept-missed nonInteractiveHit 20 | kept-missed nonInteractiveHit 20 | refused newElementOverPoint 25 | refused newElementOverPoint 25 |
| wideoverlay/link | as main | refused newElementOverPoint 24 (1 invalid) | refused newElementOverPoint 24 (1 invalid) | kept-missed nonInteractiveHit 20 | kept-missed nonInteractiveHit 20 | refused newElementOverPoint 25 | refused newElementOverPoint 25 |
| tableremount/text | keep | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 |
| tableremount/link | keep | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 |
| tablecellremount/text | keep | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 |
| tablecellremount/link | keep | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 | kept-landed 20 |
| inbox/text | as main | refused nodeGone 24 | refused nodeGone 24 | refused nodeGone 20 | refused nodeGone 20 | refused nodeGone 24 (1 invalid) | refused nodeGone 25 |
| inbox/link | as main | kept-landed 24 | kept-landed 24 | kept-landed 20 | kept-landed 20 | kept-landed 24 (1 invalid) | kept-landed 24 (1 invalid) |
| reltime/text | as main | refused nodeGone 24 | refused nodeGone 24 | refused nodeGone 20 | refused nodeGone 20 | refused nodeGone 24 (1 invalid) | refused nodeGone 24 (1 invalid) |
| reltime/link | as main | kept-landed 24 | kept-landed 24 | kept-landed 20 | kept-landed 20 | kept-landed 24 (1 invalid) | kept-landed 24 (1 invalid) |
| shrink/text | as main | refused nodeGone 24 | refused nodeGone 24 | refused nodeGone 20 | refused nodeGone 20 | refused nodeGone 24 | refused nodeGone 24 (1 invalid) |
| shrink/link | as main | kept-landed 24 | kept-landed 24 | kept-landed 20 | kept-landed 20 | kept-landed 24 | kept-landed 24 |
| linksave/text | as main | refused nodeGone 24 | refused nodeGone 24 | refused nodeGone 20 | refused nodeGone 20 | refused nodeGone 24 | refused nodeGone 24 |
| linksave/link | as main | refused relabelled 24 | refused relabelled 24 | refused relabelled 20 | refused relabelled 20 | refused relabelled 24 | refused relabelled 24 |
| moved/text | as main | refused frameMoved 24 | refused frameMoved 24 | refused nodeGone 20 | refused nodeGone 20 | refused frameMoved 24 | refused frameMoved 24 |
| moved/link | as main | refused frameMoved 24 | refused frameMoved 24 | refused nodeGone 20 | refused nodeGone 20 | refused frameMoved 24 | refused frameMoved 24 |
| linkmono/text | as main | refused nodeGone 24 | refused nodeGone 24 | refused nodeGone 20 | refused nodeGone 20 | refused nodeGone 24 | refused nodeGone 24 |
| linkmono/link | as main | refused relabelled 24 | refused relabelled 24 | refused relabelled 20 | refused relabelled 20 | refused relabelled 24 | refused relabelled 24 |
| right/text | as main | refused nodeGone 24 | refused nodeGone 24 | refused nodeGone 20 | refused nodeGone 20 | refused nodeGone 24 | refused nodeGone 24 |
| right/link | as main | kept-landed 24 | kept-landed 24 | kept-landed 20 | kept-landed 20 | kept-landed 24 | kept-landed 24 |
| centre/text | as main | refused nodeGone 23 (1 invalid) | refused nodeGone 23 (1 invalid) | refused nodeGone 20 | refused nodeGone 20 | refused nodeGone 24 | refused nodeGone 24 |
| centre/link | as main | kept-landed 23 (1 invalid) | kept-landed 23 (1 invalid) | kept-landed 20 | kept-landed 20 | kept-landed 24 | kept-landed 24 |

| Lane | Rows valid (main / fix) | Wrong targets on the fix | stalePoint.ms fix p50 / p95 / max | main | fix, twin cells | main, twin cells |
|---|---|---|---|---|---|---|
| cft | 1104/1112 / 1103/1111 | 0 | 6.324 / 25.018 / 110.422 | 8.12 / 27.511 / 236.311 | 6.027 / 54.429 / 110.422 | 13.586 / 148.462 / 236.311 |
| safari | 1080/1080 / 1080/1080 | 0 | 4.863 / 13.266 / 311.737 | 4.578 / 12.594 / 94.89 | 5.781 / 66.456 / 311.737 | 6.078 / 62.926 / 94.89 |
| electron | 1110/1118 / 1112/1120 | 0 | 4.786 / 11.495 / 73.961 | 4.43 / 10.72 / 74.842 | 6.595 / 48.982 / 73.961 | 5.924 / 54.425 / 74.842 |

| Lane | Cost: fix refused / main kept and landed (pairs), by unit where any |
|---|---|
| cft | total 40/419; capremount/text 20/20, capremount/link 20/20 |
| safari | total 80/440; wideremount/text 20/20, wideremount/link 20/20, capremount/text 20/20, capremount/link 20/20 |
| electron | total 40/420; capremount/text 20/20, capremount/link 20/20 |

| Run | Lane | Rows | Abort | Gates failing |
|---|---|---|---|---|
| final-44642664004 | cft | 525/600 | consecutive-invalid | coverage |
| final-44652645283 | cft | 80/80 | none | none |
| final-44655103884 | cft | 600/600 | none | none |
| final-44662856178 | cft | 688/720 | consecutive-invalid | coverage |
| final-44671401657 | cft | 330/330 | none | none |
| final-44642664004 | safari | 680/680 | none | none |
| final-44652645283 | safari | 80/80 | none | none |
| final-44655103884 | safari | 680/680 | none | none |
| final-44662856178 | safari | 720/720 | none | none |
| final-44642664004 | electron | 531/600 | consecutive-invalid | coverage |
| final-44652645283 | electron | 80/80 | none | none |
| final-44655103884 | electron | 600/600 | none | none |
| final-44662856178 | electron | 697/720 | consecutive-invalid | coverage |
| final-44671401657 | electron | 330/330 | none | none |

- **Every gate of ruling 891 holds on every lane.** Every twin cell is refused on the fix (`nodeGone`; the swap cells `frameMoved`, where the moved target's own handle answers, as on main) and none lands on the other control; main lands on the twin in every twin cell but the swap cells. The keep cells (`remount`, `retext`, `like`, `plain`, `btnremount`, `tableremount`, `tablecellremount`) are kept and landed on both heads, every row. #340's cells and `wideoverlay` answer as main row for row, reason included. No click on the fix reached a wrong target in any gated unit.
- **twincover at the link point (#433, report only).** The record takes the transparent overlay group laid over the target's row, alive on its own handle, not a re-created match: on Electron both heads keep it (`sameElement`) and the click falls through to the twin (22 of 22); on Safari main keeps it by `recordedHit` and lands on the twin, the fix refuses `interactiveHit`; on CfT both keep it and nothing reaches the twin.
- **The strict form's cost (ruling 889).** Of the pairs main kept and landed, the fix refused only where the record could not hold the link's container whole: `capremount` (the node cap inside the container) 40 of 40 on every lane, and `wideremount` (the width rule's visible subset, Safari only; Chromium reads the 151-child group whole) 40 of 40. Every other kept unit: 0 refusals.
- **The guard's time.** `stalePoint.ms` p50 is within 2.5 ms of main's on every lane; CfT's twin cells are faster on the fix (p50 6.0 against 13.6), as refusing skips main's search through the twin's subtree. The fix's Safari maximum (311.7 ms, one twin row) is the run's outlier.
- **Setup, not the product: a Chromium page that stops answering.** Four Chromium jobs (CfT and Electron in the twin run and the #340 run) aborted after 525 to 697 rows: one row's page read timed out after its click (`evidence@read`), then seven prepares in a row (`other@prepare`, the 20 s command bound); the keep run's 600 rows on the same lanes ran clean, and Safari never stalled. The cause is not established (it is not the twincap filler, which `1910c5ad` keeps across trials). The rows before the stall stand; the top-up run supplied the rest.
