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
    For the last two the observation must show the walk cut (`truncated.count`, resp. `truncated.depth`) and no node reading the label outside the target's own frame, else the row is invalid (`uncovered`): the twin is then absent from the record (the guard's record-only reads take only children the window shows, which neither twin is).
  - **keep** (genuine re-creation, kept and landed on main; the fix must answer as main): `remount` (the link re-rendered whole with the same label and destination at the same place, a React-style key remount), `retext` (the link's text element, a span, re-created in place), `plain` (the same text re-created through `textContent`), `like` (a same-width count).
  - **asMain** (#340's regression set; the fix must answer as main): `inbox`, `reltime`, `shrink`, `right` and `centre` (refused at the text on main, kept at the link), `linksave`, `linkmono`, `moved`. #340's `badge`, `content` and `arrow` are left out.
- **Points** (`at`): `text`, inside the control's AXStaticText near its start; `link`, 6 pt inside the control's left edge, in its padding, so the record holds the control (AXLink, or AXButton for `twinbtn`). Placement is checked from the observation before the click.
- **Verdicts**: #340's (`check.mjs` `score`), first match `wrong-target`.
- **Per trial**, beside #340's evidence: what the observation's walk read (`walk`: nodes emitted, nodes cut, the depth cut, whether the node cap stopped it) and where the twin ended against the target's place (`dom.twin`, CSS px).

**Gates** (`check.mjs` `gates`, qualify only; smoke and measure pass on coverage alone): `coverage` (every planned row ran, every unit of every head at least 80% valid); `reproduced` (main clicked the twin on at least half its valid `twin` rows; failing it is an inconclusive run); `twinRefused` (every valid fix row of `twin`, `twinbtn`, `twindel` refused with `nodeGone`, nothing reaching the target or another control) and `twinUnrecorded` (the same for `twincap`, `twindeep`), each with per-unit tallies of both heads; `keptAsMain` (every fix row of the keep cells the verdict of its paired main row, at least 10 usable pairs per unit; reports `refusedWhereMainKept`, the regression to refused); `othersAsMain` (the same for the asMain cells; a different refusal reason alone is counted, not failed); `noWrongTarget` (no fix row anywhere a wrong target; main's per unit reported); `presentation` (per unit, no more fix rows than main's on which something other than the cover activated). `guardMs` reports `stalePoint.ms` per head (all rows and the twin rows) and is never part of the pass; `report.mjs` gives it per unit and head as p50 / p95 / max. A run of some cells (`cells`) is judged on those cells alone.

`report.mjs <dir>` prints the tables from a downloaded run (`gh run download <id> -D <dir>`).

## Runs

Workflow `probe-431-qual.yml`.
