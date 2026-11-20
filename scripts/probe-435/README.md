# #435 hosted discovery and qualification: a same-label twin recorded without a frame under #431's twin search

A disposable hosted macOS kit, not product code, built from `probe/431-qual` (`3f97d533`, workflow `probe-431-qual.yml`, id 423762603; its README holds #431's phase 2 on main `1e56ca40` against `90282060`). #431 refuses a re-created match when the observation's record holds a twin (another element of the node's role, in its web area, whose label agrees), but reads only the record's framed nodes; #435 (`fix/435-frameless-twin`) reads the frameless ones too (no AXPosition or AXSize at the observation). This kit asks whether a browser ever lists a link, or its text, with no frame (discovery, main alone), qualifies the fix on the layouts that do, and runs #431's regression set main against fix.

```sh
gh workflow run probe-435-qual.yml --ref probe/435-qual -f main="$MAIN_SHA" -f mode=discover -f cells=twindetails,twincv,twinuntil,twinzero,twinclip
gh workflow run probe-435-qual.yml --ref probe/435-qual -f main="$MAIN_SHA" -f fix="$FIX_SHA" -f mode=qualify -f reps=10 -f cells=remount,retext
```

What #435 adds to #431's kit:
- **Frameless twin cells** (`twin: 'hidden'`, kind twin): the second "Inbox" link in the second row inside a container that may leave the browser listing it without a frame: `twindetails` (a collapsed `<details>`), `twincv` (a `content-visibility: auto` section below the fold), `twinuntil` (a `hidden="until-found"` section), `twinzero` (a 0x0 `overflow: hidden` box), `twinclip` (a 64 px `overflow: hidden` box the link lies past). `mark` removes the target and moves the twin out into its row, shown. The observation must hold the target as the only framed carrier, nothing reading the label with any frame (a zero-size one included, which #431 already reads) outside the target, no other control of the role with any frame at or below its row but Archive, and a node of the unit's role listed with no frame that #431's label rule would take for the target (a text reading the label; a link reading it or carrying none), else the row is `uncovered-label`, `-control` or `-frameless`. Gated as `twinFrameless`: every valid fix row refused `nodeGone` (or ruling 889's `interactiveHit`), nothing reaching another control.
- **Mode `discover`** (three per unit by default): a row whose observation falls short records its gap (`gap`) and runs on, so main's answer is read either way. Every row records how the observation listed the label's carriers (`walk.labelled.label`: role and frame, `framed`, `zero` with no area, `frameless` with none) and every frameless node by role (`walk.labelled.frameless`); `report.mjs` tabulates both.
- A qualification with fewer repetitions asks the valid bar (80%) of them in usable pairs per unit (8 of 10), as coverage does.

The harness, as #431's:
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

## Discovery: does a browser list a link, or its text, without a frame?

[Run 44688188130](https://github.com/SSFSKIM/cua/actions/runs/44688188130) (kit `9daa744e`, mode discover), main `f8f34652` alone, three rows per unit; Chrome for Testing 157.0.8103.78 and Safari 27.2 on image `20261112.0504.1`, Electron 44.4.5 / Chromium 152.0.7977.130 on `20261102.0473.1`; every lane in the background under the cover, 30/30 rows valid on each. How the observation listed the nodes reading "Inbox" (the target's link and text, and the twin's where listed; every row of a unit alike), and main's answer once the twin was re-rendered in the target's place:

| Layout | cft: twin listed | cft: main | electron: twin listed | electron: main | safari: twin listed | safari: main |
|---|---|---|---|---|---|---|
| `twindetails` (collapsed `<details>`) | no | wrong target (kept, re-created) 6 | no | wrong target 6 | no | wrong target 6 |
| `twinuntil` (`hidden="until-found"`) | no | wrong target 6 | no | wrong target 6 | no | wrong target 6 |
| `twincv` (`content-visibility: auto`, below the fold) | framed | refused `nodeGone` 6 | framed | refused `nodeGone` 6 | no | text: wrong target 3; link: refused `nodeGone` 3 |
| `twinzero` (0x0 `overflow: hidden`) | framed | refused `nodeGone` 6 | framed | refused `nodeGone` 6 | framed | refused `nodeGone` 6 |
| `twinclip` (64 px `overflow: hidden`, the link past it) | framed | refused `nodeGone` 6 | framed | refused `nodeGone` 6 | framed | refused `nodeGone` 6 |

- **No lane listed any node without a frame, in any layout.** Every observation held no node with `frame: null`, of any role (`walk.labelled.frameless` empty on all 90 rows). Each layout either leaves the twin out of the tree (`<details>` and `until-found` on all three browsers, `content-visibility` on Safari) or lists its link and text with frames (the `overflow: hidden` boxes everywhere, `content-visibility` on Chromium), which #431's search on main already reads and refuses. No frameless twin cell could be built, so step 2 (main against the fix on a frameless twin) has nothing to run: on these browsers #435's fix is defence only.
- **The unlisted twins are wrong targets on main**, as ruling 881's unrecorded twins were before #431: the record holds no twin, so the re-created match is kept and the click lands on the other link. #435 reads only the record, so it cannot refuse them either (not run on the fix): the same class as the issue's out-of-scope `display:none` twin, and `twincap`/`twindeep`, which #431 refuses only through its coverage rule.
- Every discovery row's gap was `frameless` (twin unlisted) or `framed` (twin framed), with one exception: Safari's `twincv/link` reads `framed` though the twin is not listed, so another framed link agreed with the target's link under the label rule at that point (the kit does not keep labels to say which). It does not change the finding: Safari listed no node without a frame there either.

## Regression set: main against the fix

Main `f8f34652dc1591b4bdf3f8b44ac479518f6becfc` (#431 merged), the final #435 head `493c64cab7e3f1d9aedf0882f9fb8c14b2fd5997` (`66ae2e8d` plus a performance-only cache of the node's label words). Kit `9daa744e`, mode qualify, ten rows per head per unit, the heads interleaved, in two runs to keep each lane under 500 rows: [run A](https://github.com/SSFSKIM/cua/actions/runs/44689045231) (the keep cells, `twin`, `twincap`, `capremount`, `wideremount`) and [run B](https://github.com/SSFSKIM/cua/actions/runs/44694519236) (#340's cells and `wideoverlay`). Every lane of both runs passed every gate, every row valid, no abort; every lane in the background under the cover. Chrome for Testing 156.0.8078.80 (run A, image `20261102.0473.1`) and 157.0.8103.78 (run B, `20261117.0516.1`), Safari 27.2 (`20261102.0473.1`), Electron 44.4.5 / Chromium 152.0.7977.130 (`20261112.0504.1`, `20261117.0516.1`).

A row's verdict is followed by the guard's reason (valid rows per head):

| Unit | Gate | cft: main | cft: fix | safari: main | safari: fix | electron: main | electron: fix |
|---|---|---|---|---|---|---|---|
| twin/text | twin | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 |
| twin/link | twin | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 |
| twincap/text | twin | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 |
| twincap/link | twin | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 |
| remount/text | keep | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |
| remount/link | keep | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |
| retext/text | keep | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |
| retext/link | keep | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |
| like/text | keep | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |
| like/link | keep | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |
| plain/text | keep | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |
| plain/link | keep | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |
| btnremount/link | keep | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |
| wideremount/text | big | – | – | refused nodeGone 10 | refused nodeGone 10 | – | – |
| wideremount/link | big | – | – | refused nodeGone 10 | refused nodeGone 10 | – | – |
| capremount/text | big | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 |
| capremount/link | big | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 |
| wideoverlay/text | asMain | refused newElementOverPoint 10 | refused newElementOverPoint 10 | kept-missed nonInteractiveHit 10 | kept-missed nonInteractiveHit 10 | refused newElementOverPoint 10 | refused newElementOverPoint 10 |
| wideoverlay/link | asMain | refused newElementOverPoint 10 | refused newElementOverPoint 10 | kept-missed nonInteractiveHit 10 | kept-missed nonInteractiveHit 10 | refused newElementOverPoint 10 | refused newElementOverPoint 10 |
| tableremount/text | keep | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |
| tableremount/link | keep | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |
| tablecellremount/text | keep | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |
| tablecellremount/link | keep | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |
| inbox/text | asMain | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 |
| inbox/link | asMain | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |
| reltime/text | asMain | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 |
| reltime/link | asMain | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |
| shrink/text | asMain | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 |
| shrink/link | asMain | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |
| linksave/text | asMain | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 |
| linksave/link | asMain | refused relabelled 10 | refused relabelled 10 | refused relabelled 10 | refused relabelled 10 | refused relabelled 10 | refused relabelled 10 |
| moved/text | asMain | refused frameMoved 10 | refused frameMoved 10 | refused nodeGone 10 | refused nodeGone 10 | refused frameMoved 10 | refused frameMoved 10 |
| moved/link | asMain | refused frameMoved 10 | refused frameMoved 10 | refused nodeGone 10 | refused nodeGone 10 | refused frameMoved 10 | refused frameMoved 10 |
| linkmono/text | asMain | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 |
| linkmono/link | asMain | refused relabelled 10 | refused relabelled 10 | refused relabelled 10 | refused relabelled 10 | refused relabelled 10 | refused relabelled 10 |
| right/text | asMain | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 |
| right/link | asMain | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |
| centre/text | asMain | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 | refused nodeGone 10 |
| centre/link | asMain | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 | kept-landed sameElement 10 |

| Lane | Rows valid (main / fix) | Wrong targets on the fix | stalePoint.ms main p50 / p95 / max (n) | stalePoint.ms fix p50 / p95 / max (n) |
|---|---|---|---|---|
| cft | 370/370 / 370/370 | 0 | 6.811 / 20.354 / 38.036 (370) | 7.121 / 20.035 / 49.53 (370) |
| safari | 390/390 / 390/390 | 0 | 4.203 / 8.213 / 14.03 (390) | 4.119 / 9.017 / 365.043 (390) |
| electron | 370/370 / 370/370 | 0 | 4.476 / 9.768 / 15.371 (370) | 4.763 / 10.145 / 16.824 (370) |

| Run | Lane | Image | Browser | Rows | Abort | Gates failing |
|---|---|---|---|---|---|---|
| regA-44689045231 | cft | 20261102.0473.1 | 156.0.8078.80 | 380/380 | none | none |
| regA-44689045231 | electron | 20261112.0504.1 | Electron 44.4.5 / Chromium 152.0.7977.130 | 380/380 | none | none |
| regA-44689045231 | safari | 20261102.0473.1 | 27.2 | 420/420 | none | none |
| regB-44694519236 | cft | 20261117.0516.1 | 157.0.8103.78 | 360/360 | none | none |
| regB-44694519236 | electron | 20261117.0516.1 | Electron 44.4.5 / Chromium 152.0.7977.130 | 360/360 | none | none |
| regB-44694519236 | safari | 20261102.0473.1 | 27.2 | 360/360 | none | none |

- **Every unit answers as on main, row for row, reason included.** Pairing each fix row with its main row of the same unit and repetition: 0 differing verdicts and 0 differing reasons on every lane, in both runs (`keptAsMain`, `othersAsMain`, `bigPage`). No new refusal, and no click on the fix reached a wrong target (main: none either).
- **The keep cells** (`remount`, `retext`, `plain`, `like`, `btnremount`, `tableremount`, `tablecellremount`) are kept and landed on both heads, every row, on every lane: reading the record's frameless nodes refuses no genuine re-creation here (the pages hold none, as discovery found).
- **`twin` and `twincap`** are refused `nodeGone` on both heads (main carries #431). **`capremount`** and Safari's **`wideremount`** are refused `nodeGone` on both, #431's known cost of its coverage rule, unchanged by #435.
- **The guard's time.** `stalePoint.ms` p50 within 0.4 ms of main's on every lane, p95 within 0.9 ms. The fix's Safari maximum, 365.0 ms, is one `wideoverlay/link` row (kept-missed, as main); #431's qualification saw a 311.7 ms Safari outlier of the same kind. Taken on `493c64ca` throughout.
