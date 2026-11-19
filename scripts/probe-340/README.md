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
  - the rest, which must answer as main: `like` (same width: "Like (12)" → "Like (13)" at a fixed width with tabular digits), `plain` (the same text re-created) and `linkmono` ("Save" → "Send", same width in monospace: refused on main by #298's re-created label check).
  - Text changes replace `textContent`, which re-creates the link's text node and keeps the `<a>`.
- **Where the click goes** (`at`): `text`, inside the link's AXStaticText, a third of its width or 12 pt from its start, whichever is less, so the record holds the AXStaticText (the failing case); `link`, 6 pt inside the link's left edge, in its padding, so the record holds the AXLink. A row whose guard record names another role than the unit aims at is invalid (`placement`), as is a click with no guard record (`no-guard`).
- **Units**: every cell × both points, ten per unit to measure, twenty per unit per head to qualify, the heads interleaved.
- **Per trial**: the click's outcome and the guard's record (`meta.stalePoint`: verdict, reason, identity, the recorded and hit roles, its time); the page's pointer-event log; the geometry: the observed frames of the link and its text against the engine's own re-observation after the click (screen points), and the page's own before and after (CSS px), as the origin's move (`dx`, `dy`) and the width's change (`dw`); the witness (`presentationHeld`).
- **Verdicts** (`check.mjs`): `kept-landed` (kept, the click landed on the target and answered success); `kept-landed-error` (landed, the click answered an error); `kept-missed` (kept, no click on the target); `refused` (refused, nothing reached the target); `refused-delivered` (refused, yet an event reached it); `wrong-target` (any pointer event on another link); `observe-failed` (after a valid prepare, the head's observation or the link in it missing: the head's own answer, a valid row). A setup failure before the click is an invalid row with its step, never a product miss.

**Gates** (`check.mjs` `gates`, qualify only): coverage (every planned row ran, and every unit of every head kept 80% of its rows valid); every valid fix row of `inbox`, `reltime` and `shrink`, at both points, `kept-landed` (`keptAndLanded`); every valid fix row of `linksave` and `moved` `refused` (`stillRefused`); every fix row of the other cells the same verdict as its paired main row (`othersAsMain`; a different refusal reason alone is counted, not failed); no `wrong-target` fix row (`noWrongTarget`); per unit, no more fix rows than main's on which something other than the cover activated (`presentation`). Each of the first three requires a valid fix row in every unit it covers.

`report.mjs <dir>` prints the tables from a downloaded run (`gh run download <id> -D <dir>`).

## Runs

Workflow `probe-340-qual.yml`.
