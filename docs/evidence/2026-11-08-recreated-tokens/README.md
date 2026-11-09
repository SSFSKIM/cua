# #303: Chromium's re-created table columns keep their tokens (hosted macOS, 2026-11-08)

## Setup

- **Runners:** GitHub-hosted macOS 26.7.2, Chrome for Testing 156; two runners.
- **Engines:** origin/main against `fix/303-recreated-tokens` fd51d41b, release builds. Rep 1 built main at 364e017d, rep 2
  at 6baaa12a; neither commit touches the walk or the lineage.
- **Kit:** `probe/303-measure` (`scripts/probe-303/tokens.mjs`; the handle tool is #299's `tool.swift`).
  - Each (page, engine) ran on a fresh Chrome, one engine alive at a time, with 3 or 4 observations on one connection.
  - After the first observation the tool keeps each table's column and child handles, and after every observation it
    checks whether they still read. -25202 means Chromium re-created them.
  - The engine order alternates by runner.
- **Results:** `~/.local/share/probe-303/run-42558781067/` on the MacBook.
- **Run:** https://github.com/SSFSKIM/cua/actions/runs/42558781067

## Tokens across observations

Columns are listed as their tokens, then `|` and the header group's token. "Re-created" means the kept handles read -25202
at that observation's check. On big, huge and HN the header group is beyond the 4,000-node budget and is not printed.

| page | engine | obs 1 | obs 2 | obs 3 | re-created before |
|---|---|---|---|---|---|
| 20×5 table (rep 1) | main | t286–t290 \| t291 | same | **t327–t331 \| t332** | obs 3 |
| 20×5 table (rep 1) | branch | t286–t290 \| t291 | same | **same** | obs 3 |
| 20×5 table (rep 2) | main | t286–t290 \| t291 | same | **t327–t331 \| t332** | obs 3 |
| 20×5 table (rep 2) | branch | t286–t290 \| t291 | same | **same** | obs 3 |
| 3,000 rows (rep 2) | main | t3959–t3964 | **t4000–t4005** | t4000–t4005 | obs 2 |
| 3,000 rows (rep 2) | branch | t3959–t3964 | **same** | same | obs 2 |
| 6,000 rows (rep 1) | main | t3959–t3964 | same | **t4000–t4005** | obs 2 |
| 6,000 rows (both) | branch | t3959–t3964 | same | same | obs 2 |
| HN thread (rep 2) | main | t3963 | **t4000** | t4000 | obs 2 |
| HN thread (rep 2) | branch | t3963 | **t3963** | t3963 | obs 2 |

Rep 1's 3,000-row table and HN thread are not in the table, because the handle check cannot show the re-creation there.
Chromium re-created the columns between the first observation and the tool's snapshot. On the table the snapshot
itself read 7 stale handles (role "?"), and on HN it took the new handle. The tokens still tell the story: main went
from t3959–t3964 to t4000–t4005 (on HN, t3963 to t4000), and the branch kept t3959–t3964 and t3963.

**Read failures** (`fetchFailures`): the branch had 0 in every observation on both runners. Main had 0 everywhere except
rep 1's replacement page at observation 2. There it had 3 failures, and printed only 3 of the 5 columns and no header
group, because the columns were re-created mid-walk.

## A real replacement still takes a new token

The replacement page is the 20×5 table with a Save button. Before observation 3 the page replaces the button with an
identical clone (a new DOM node). Before observation 4 it inserts a first column: a header cell and a cell in every row.
The results were the same on both runners.

| step | main | branch |
|---|---|---|
| obs 1 → 2 (nothing changed) | button t35, columns t288–t292 \| t293 | the same |
| obs 3, the button cloned | button **t329** (new); columns t330–t334 \| t335 (re-issued) | button **t329** (new); columns **t288–t292 \| t293** (kept) |
| obs 4, a column inserted | six columns **t378–t383** \| t384, all new | six columns **t372–t377** \| t378, all new |

## Cost

Nothing is read unless the vendor's rule leaves both a new sibling and an old synthesized one unmatched. Then the cost is
one AXRole read per candidate that matched in everything else. Here that was 5 or 6 reads per re-creation.

## Limits

- An AppKit table that re-creates an identical column (the same identity, frame and first cell) also keeps its token.
  To the model that is the same element.
- A column re-created during the walk itself could still fail its read. The branch never did here. Main did once,
  above.
- A frameless or childless synthesized element takes a new token, as under the vendor's rule.

## Tests

`RecreatedTokenTests` (7) and the engine's `swift test` pass. The hosted A/B above ran on fd51d41b. The childless and
frameless condition (fbbdccd6) came after it and only narrows the rule.
