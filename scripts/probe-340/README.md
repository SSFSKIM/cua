# #340 hosted measurement and qualification: a link whose text changes under #296's stale-point guard

A disposable hosted macOS kit, not product code. It measures, on GitHub-hosted macOS, how main's stale-point guard (#296, with #298's `relabelled` and re-created label check) answers a coordinate click on a link whose text the page replaced between the screenshot and the click, and whether the click lands on the intended link. It then qualifies the #340 fix against main. Built from `probe/398-qual`'s lanes (exact-SHA stock builds, the owned cover and activation witness, the long-poll fixture server, one engine connection per trial); the helpers it needs are copied here (`proc.mjs`, `wire.mjs`, `fixture-server.mjs`, `host.swift`, `electron/`) so the kit stands on main alone. The cells are the ones `probe/298-measure` (`inbox`, `reltime`, `linksave`) and `probe/330-measure` (the "replaced link text" cells) measured, rebuilt on this harness.

```sh
gh workflow run probe-340-qual.yml --ref probe/340-qual -f main="$MAIN_SHA" -f mode=measure                       # Phase 1: main alone
gh workflow run probe-340-qual.yml --ref probe/340-qual -f main="$MAIN_SHA" -f fix="$FIX_SHA" -f mode=qualify    # Phase 2
```

- **Heads.** Unmodified release builds of exact SHAs (`git worktree add --detach`, clean before and after the build). The harness drives the engine's own wire: `get_app_state` with a screenshot (the observation #296's record is taken from), the cell's change, then `click` at the screenshot's pixels, one engine connection (so one fresh lineage and record) per trial; only the head under trial holds a connection.
- **Lanes.** Chrome for Testing, Safari and Electron (`electron/`, Electron 44.4.5) on the owned page (`page.mjs`). Each lane tries the background under the owned cover with #395's activation witness, and falls back to frontmost only when the background could not be set up before any cua call.
- **The page.** Three links in a column, each `display:inline-block` with 32 px of side padding: the target, then Archive and Drafts. All three are rebuilt at every prepare. Every pointer event the page receives is logged with the link it reached, which is how a click is judged to have landed (a `click` on the target) or hit a wrong target (any event on another link).
- **Cells** (`cells.mjs`), each applied by `mark` after the observation and 500 ms before the click:
  - growing text: `inbox` ("Inbox" → "Inbox (3)") and `reltime` ("1 minute ago" → "2 minutes ago");
  - shrinking text: `shrink` ("Inbox (12)" → "Inbox");
  - true refusals: `linksave` ("Save" → "Delete"), and `moved` (the target and Archive swap rows, so Archive lies where the target was);
  - the rest, which must answer as main: `like` (same width: "Like (12)" → "Like (13)" at a fixed width with tabular digits), `plain` (the same text re-created), `linkmono` ("Save" → "Send", same width in monospace: refused on main by #298's re-created label check), and `twin` (two links labelled "Inbox" with different destinations: the target is removed and the second slides up into its row; the right answer is `nodeGone`, but main clicks the second link, a wrong target of #296's same-frame re-created match filed as #431 and outside #340, so #340 gates it as main and reports its wrong-target count apart);
  - a named answer, gated: `badge` (a count badge "3" → "12" in a clickable span, so AXPress, inside the link after its word "Inbox"; expected refused at the text, as main at the link);
  - informational, never part of the pass (`statedLimits`): `right` (a right-aligned relative time that grows, "1 minute ago" → "2 minutes ago" in a 260 px link; expected kept at the text) and `centre` (a centred label that grows, "Inbox" → "Inbox (3)" in a 260 px link; expected `nodeGone` at the text, as on main); at the link, both as main.
  - A refusal's reason `nodeGone` and `frameMoved` count as one wherever a reason is expected (the coordinator's ruling: a link shrinking with its text answers either at a vanished count).
  - Text changes replace `textContent`, which re-creates the link's text node and keeps the `<a>`.
- **Where the click goes** (`at`): `text`, inside the link's AXStaticText, a third of its width or 12 pt from its start, whichever is less, so the record holds the AXStaticText (the failing case); `link`, 6 pt inside the link's left edge, in its padding, so the record holds the AXLink. Placement is checked before the click from the observation itself: the deepest framed node holding the point the engine will post (by the nodes' `depth`, else the smallest frame) must have the unit's role, else the row is invalid (`placement`). After that check, a click with no guard record or one taken at another role is the head's own answer (`no-guard`, `misplaced`), never an invalid row.
- **Units**: every cell × both points, ten per unit to measure, twenty per unit per head to qualify, the heads interleaved.
- **Setup checks.** Each engine primes with screenshot observations like the trials' (each must answer with a screenshot, else the lane aborts as setup; up to three until the prepared link is found, recorded as `primed` in `config.json`). A scored observation that fails or lacks the link is a valid `observe-failed` row only once the page re-attests it still holds the prepared link (`read`: the trial, present, the cell's text before), else invalid (`reattest`). After `mark`, a cell whose text changes must show the change in the accessibility tree before the click: the helper's `axtext` op (`host.swift`, the only AXValue read: counts of the owned app's AXStaticTexts reading the text before and after, depth at most 60, at most 6000 elements) is polled every 100 ms for up to 2.5 s until the new text is read and the old is gone, else the row is invalid (`unexercised`); the click still waits at least 500 ms after `mark`.
- **Per trial**: whether the change reached the accessibility tree (`exercised`: true, or null for cells whose text does not change); the click's outcome and the guard's record (`meta.stalePoint`: verdict, reason, identity, the recorded and hit roles, its time); the page's pointer-event log; the geometry: the observed frames of the link and its text against the engine's own re-observation after the click (screen points), and the page's own before and after (CSS px), as the origin's move (`dx`, `dy`) and the width's change (`dw`); the witness (`presentationHeld`).
- **Verdicts** (`check.mjs`), first match: `wrong-target` (any pointer event on another link, whatever the metadata); `no-guard` (the click carried no guard record); `misplaced` (the record took another role than the unit aims at); `refused` (refused, the click answered `screenChangedSinceScreenshot`, nothing reached the target); `refused-delivered` (refused, yet an event reached it); `refused-unreported` (refused, nothing reached the target, but the click answered something else); `kept-landed` (kept, the click landed on the target and answered success); `kept-landed-error` (landed, the click answered an error); `kept-missed` (kept, no click on the target); `observe-failed` (after a valid prepare, the head's observation or the link in it missing, the page re-attested: the head's own answer, a valid row). A setup failure before the click is an invalid row with its step, never a product miss.

**Gates** (`check.mjs` `gates`, qualify only: smoke and measure, with one head or two, report coverage and summaries, and pass on coverage alone): coverage (every planned row ran, and every unit of every head kept 80% of its rows valid); main refused (`refused`) at least half its valid rows of `inbox` and `reltime` at `text` (`reproduced`; failing it reads "not reproduced", an inconclusive run, not a verdict on the fix); every valid fix row of `inbox`, `reltime` and `shrink`, at both points, `kept-landed` (`keptAndLanded`); every valid fix row of `linksave` and `moved` `refused` (`stillRefused`); every fix row of the other cells the same verdict as its paired main row, with at least 10 usable pairs (both rows valid, neither `observe-failed`) in every such unit (`othersAsMain`, reporting the per-unit pair counts; a different refusal reason alone is counted, not failed); no `wrong-target` fix row outside `twin` (`noWrongTarget`, which reports twin's count on both heads apart, #431); every `badge` fix row at the text refused and at the link as main's paired row (`expectedAnswers`); per unit, no more fix rows than main's on which something other than the cover activated (`presentation`). `statedLimits` is reported and never part of the pass: `right` and `centre` at the text each with its expected verdict (and reason), at the link as main's paired row. The report also gives `stalePoint.ms` per head, over all valid rows and split by the guard's verdict. Each of `keptAndLanded`, `stillRefused`, `othersAsMain` and `expectedAnswers` requires a valid fix row in every unit it covers.

The guard's own time (`stalePoint.ms`) is reported per unit and head as p50 / p95 / max.

`report.mjs <dir>` prints the tables from a downloaded run (`gh run download <id> -D <dir>`).

## Runs

Workflow `probe-340-qual.yml`, id `423661274`, [registration](https://github.com/SSFSKIM/cua/actions/runs/44500975602) (Ubuntu only). Main `1e56ca404f6acac2d76f4e0d32019a63d90b4276` throughout. Hosted macOS images `20261102.0473.1` and `20261112.0504.1`; Chrome for Testing 156.0.8078.80 (157.0.8103.78 in the smoke), Safari 27.2, Electron 44.4.5 / Chromium 152.0.7977.130.

| Run | Kit | Mode | What it established |
|---|---|---|---|
| [Smoke](https://github.com/SSFSKIM/cua/actions/runs/44501026254) | `710cdbfb` | one trial per unit | Every lane in the background under the cover, zero invalid rows, every unit's record at the intended role; main reproduces the refusal. |
| [Phase 1 measurement](https://github.com/SSFSKIM/cua/actions/runs/44507959686) | `8a1fb2a3` | ten per unit, main only | Below. |

## Phase 1: main measured

All three lanes in the background under the cover, the witness held on every row; 220/220 rows valid per lane (22 units × 10), every text change seen in the accessibility tree before the click (160/160 per lane), every record at the intended role. The three lanes answer alike row for row except where noted.

| Unit | Record holds | Main, CfT / Safari / Electron | Guard reason | Identity | Landed on the intended link | Geometry, the recorded node (AX, pt) |
|---|---|---|---|---|---|---|
| inbox: "Inbox" → "Inbox (3)" | text | **refused 10/10** each | `nodeGone` | none | 0 | dx 0, dw +30 |
| | link | kept 10/10 each | `sameElement` | handle | 10/10 | dx 0, dw +30 |
| reltime: "1 minute ago" → "2 minutes ago" | text | **refused 10/10** each | `nodeGone` | none | 0 | dx 0, dw +10 |
| | link | kept 10/10 each | `sameElement` | handle | 10/10 | dx 0, dw +10 |
| shrink: "Inbox (12)" → "Inbox" | text | **refused 10/10** each | `nodeGone` | none | 0 | dx 0, dw −42 |
| | link | kept 10/10 each | `sameElement` | handle | 10/10 | dx 0, dw −42 (Safari −41) |
| linksave: "Save" → "Delete" | text | refused 10/10 each | `nodeGone` | none | 0 | dx 0, dw +12 |
| | link | refused 10/10 each | `relabelled` | handle | 0 | dx 0, dw +12 |
| moved: the target and Archive swap rows | text | refused 10/10 each | Chromium `frameMoved` (handle kept); Safari `nodeGone` | | 0, no wrong target | dy +64 |
| | link | refused 10/10 each | likewise | | 0, no wrong target | dy +64 |
| twin: two "Inbox" links, the first removed, the second slides into its row | text | **kept 10/10 each, every click on the second link** | `sameElement` | recreated | 0; **wrong target 10/10** | dx 0, dw 0 |
| | link | **kept 10/10 each, every click on the second link** | `sameElement` | recreated | 0; **wrong target 10/10** | dx 0, dw 0 |
| like: "Like (12)" → "Like (13)", same width | text | kept 10/10 each | `sameElement` | recreated | 10/10 | 0 |
| | link | kept 10/10 each | `sameElement` | handle | 10/10 | 0 |
| plain: the same text re-created | text | kept 10/10 each | `sameElement` | recreated (Electron: handle) | 10/10 | 0 |
| | link | kept 10/10 each | `sameElement` | handle | 10/10 | 0 |
| linkmono: "Save" → "Send", same width | text | refused 10/10 each | `nodeGone` | none | 0 | 0 |
| | link | refused 10/10 each | `relabelled` | handle | 0 | 0 |
| right: right-aligned, "1 minute ago" → "2 minutes ago" | text | refused 10/10 each | `nodeGone` | none | 0 | dx −10, dw +10 (right edge fixed) |
| | link | kept 10/10 each | `sameElement` | handle | 10/10 | 0 (the link's width is fixed) |
| centre: centred, "Inbox" → "Inbox (3)" | text | refused 10/10 each | `nodeGone` | none | 0 | dx −15, dw +30 (both edges move) |
| | link | kept 10/10 each | `sameElement` | handle | 10/10 | 0 |

- **The bug, reproduced exactly.** Wherever the record holds the link's AXStaticText and its width changes (grow, shrink, right-aligned, centred), main refuses `nodeGone` 10/10 on all three lanes; with the record on the AXLink the same changes are kept and land. The page's own geometry agrees with the AX frames to within 1 pt: a left-aligned text keeps its origin and only its width changes (+30, +10, −42 pt), a right-aligned one keeps its right edge, a centred one moves both edges by half the growth.
- **A wrong target on main today: `twin`.** Two links with the same label: when the first is removed and the second slides into its row, #296's re-created search matches the second (same role, the same frame, the same label) and main clicks it, 10/10 at the text and 10/10 at the link, on all three lanes. This is not #340's regression but a gap of #296's re-created match; as a `refuse` cell it fails `stillRefused` and `noWrongTarget` on any head that answers as main.
- **Moved.** A link moved away with another taking its place is refused everywhere; Chromium keeps the moved node's handle and refuses `frameMoved`, Safari re-creates it and refuses `nodeGone`. No click reached Archive.
- **The guard's own time** (`stalePoint.ms`, every valid row): CfT p50 6.0 / p95 18.4 / max 58.7 ms; Safari 3.2 / 9.5 / 47.1; Electron 3.6 / 10.0 / 25.1. A kept re-created match costs the most (CfT `like/text` p50 19.4, `twin/text` 15.9; Safari and Electron 4.5–8.2); a handle that answers costs 1–3 ms on Safari and Electron and 5–7 ms on CfT; `nodeGone` 3–9 ms (p50 per unit). Per-unit quantiles are in the run's tables (`report.mjs`).
