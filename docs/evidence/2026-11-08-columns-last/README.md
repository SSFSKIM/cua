# #310: AXColumn elements wait last (hosted macOS, 2026-11-08)

## Setup

- **Runners:** GitHub-hosted macOS 26.7.2, Chrome for Testing 156.
- **Engines:** origin/main at 364e017d (A) against `fix/310-columns-last` at 6ec647eb (B), release builds.
- **Kit:** `probe/310-measure` (`scripts/probe-310/walk.mjs`).
  - Pages:
    - #304's local tables: 3,000 rows (`local-table`), the same with a fixed toolbar (`local-table-bar`), and 6,000 rows with it (`local-table-6k`);
    - tables that fit the 4,000-node budget: 120 and 200 of #304's rows (`fit-120`, `fit-200`) and 600 lean rows (`lean-600`).
  - Each page is observed at the top and half way down (`f50`). Per page and position, one Chrome runs a throwaway warm-up observation, then 3 pairs, the order alternating within the pair.
  - Each pair's printed trees are compared node by node (role, title, description, value, frame) in order.
- **Runs:**
  - https://github.com/SSFSKIM/cua/actions/runs/42559947292, 2 runners. Its walk time was not recorded: the kit read `timings.walk` for `walkMs`.
  - https://github.com/SSFSKIM/cua/actions/runs/42561992545, 3 runners, kit dbfbd253, walk time recorded.
- **Results:** `~/.local/share/probe-310/run-42559947292/` and `run-42561992545/` on the MacBook (`analyse.py` beside them).

## Run 42561992545: 9 pairs per cell

| page | position | walk ms, A / B median | B − A paired, median | width rule ms, A / B | nodes | columns printed, A / B | read failures, A / B | pairs identical |
|---|---|---|---|---|---|---|---|---|
| local-table | top | 3,568 / 2,984 | −385 | 141 / 24 | 3,989 (cap) | 0–6 / 0 | 22 / 0 | 2/9 |
| local-table | f50 | 3,607 / 3,219 | −300 | 97 / 30 | 3,989 (cap) | 0–6 / 0 | 24 / 0 | 1/9 |
| local-table-bar | top | 2,625 / 2,551 | −34 | 92 / 20 | 3,989 (cap) | 0–6 / 0 | 11 / 0 | 1/9 |
| local-table-bar | f50 | 2,246 / 2,070 | −93 | 97 / 16 | 3,989 (cap) | 5–6 / 0 | 1 / 0 | 0/9 |
| local-table-6k | top | 3,033 / 2,618 | −567 | 214 / 31 | 3,989 (cap) | 6 / 0 | 0 / 0 | 0/9 |
| local-table-6k | f50 | 2,639 / 2,612 | −338 | 182 / 28 | 3,989 (cap) | 6 / 0 | 0 / 0 | 0/9 |
| fit-120 | top | 731 / 761 | +29 | 9 / 10 | 1,759 | 6 / 6 | 0 / 0 | 9/9 |
| fit-120 | f50 | 803 / 890 | +27 | 10 / 10 | 1,759 | 6 / 6 | 0 / 0 | 9/9 |
| fit-200 | top | 1,349 / 1,241 | +26 | 19 / 16 | 2,879 / 2,872–2,879 | 6 / 0–6 | 0 / 7 | 8/9 |
| fit-200 | f50 | 1,437 / 1,319 | −26 | 20 / 18 | 2,878–2,879 / 2,872–2,879 | 6 / 0–6 | 1 / 14 | 7/9 |
| lean-600 | top | 1,454 / 1,330 | −121 | 10 / 11 | 3,067 | 2 / 2 | 0 / 0 | 9/9 |
| lean-600 | f50 | 1,609 / 1,518 | −35 | 14 / 13 | 3,066–3,067 / 3,064–3,067 | 2 / 0–2 | 1 / 3 | 7/9 |

- **The cut tables:**
  - A pair differs where it should. A prints the columns, B prints the same number of other nodes in their place: the cells next in the document's order.
  - A also loses columns to read failures: Chromium re-creates them mid-walk.
- **The tables that fit:** every pair in which neither engine failed a read is identical in order.

The first run (42559947292) agrees: on the cut tables the width rule's time is 17–253 ms for A (the 17 in an observation that failed 6 reads) against 15–82 for B, apart from three B outliers on local-table-bar (289, 435 and 582 ms). On the tables that fit, every pair without read failures is identical.

## The tables that fit: the 5 observations B lost its columns

Across both runs there are 108 fitting-table observations per engine:
- B failed reads in 5, and each time printed no columns.
- A failed in 4, one node each, still printing its columns.

Each pair keeps the full list of nodes one engine printed and the other did not (at most 7 here, under the 20 kept). In all 5, B printed nothing its pair lacked, and lacked only these:

| record | lost by B | A in the pair |
|---|---|---|
| run 42559947292 rep 1, lean-600 top, B2 | 2 AXColumn + the header AXGroup | 0 failures |
| run 42561992545 rep 1, fit-200 top, B2 | 6 AXColumn + the header AXGroup | 0 failures |
| run 42561992545 rep 2, fit-200 f50, B1 | 6 AXColumn | 1 failure |
| run 42561992545 rep 2, fit-200 f50, B2 | 6 AXColumn + the header AXGroup | 0 failures |
| run 42561992545 rep 2, lean-600 f50, B0 | 2 AXColumn + the header AXGroup | 0 failures |

The lost AXGroup is Chromium's synthesized table-header group, not the header row. In a full tree (fit-200 top, A0, run 42561992545 rep 1) it is node 2854, `AXGroup||||0,174,1,1`: listed right after the six AXColumns (2848–2853) and framed 1×1 at the web area's origin. The header row's cells are nodes 36–46, AXCells at y = 245, h = 19, reached through the rows. Every one of them printed in all 5. These observations ran long (about 2.2 s against 1.2–1.4 s), which fits the columns being re-created mid-walk: reading them last leaves a longer window for that.

## Offline

`WideListInvariantTests` exempts the bare columns alone, over 282 spike trees: 154 verified, 128 alias-incomplete, 0 violations. Command: `CUA_304_TREES=$HOME/.local/share/probe-304 swift test --filter WideListInvariantTests`.

## Limits

- A table that fits can lose its columns, and the header group, in an observation where Chromium re-creates them mid-walk (5 of 108 here). The header row's cells still print.
- On a table the budget cuts, the columns are not printed.
